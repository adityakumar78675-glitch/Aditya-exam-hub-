import { supabase } from "@/integrations/supabase/client";
import { lookupBookCover } from "@/lib/book-cover.functions";
import { base64ToBlob, extractPdfInfo, renderFirstPageThumb } from "@/lib/pdf-cover";

export const COVER_BUCKET = "note-covers";
const YEAR = 60 * 60 * 24 * 365;

export type CoverResult = {
  cover_url: string | null;
  cover_source: string | null;
  book_author: string | null;
  book_isbn: string | null;
  book_publisher: string | null;
  cover_path: string | null;
};

const EMPTY: CoverResult = {
  cover_url: null,
  cover_source: null,
  book_author: null,
  book_isbn: null,
  book_publisher: null,
  cover_path: null,
};

export async function uploadCoverBlob(blob: Blob, batchId: string): Promise<{ path: string; url: string } | null> {
  const ext = blob.type.includes("png") ? "png" : "jpg";
  const path = `${batchId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(COVER_BUCKET).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: true,
  });
  if (error) return null;
  const { data } = await supabase.storage.from(COVER_BUCKET).createSignedUrl(path, YEAR);
  if (!data?.signedUrl) return null;
  return { path, url: data.signedUrl };
}

/**
 * Detect a book cover for an uploaded PDF.
 * Priority: ISBN → exact title → title+author → PDF first-page thumbnail → none (UI placeholder).
 * Never throws: cover detection must not break uploads.
 */
export async function detectCover(
  file: File,
  batchId: string,
  fallbackTitle?: string,
  onStatus?: (s: string) => void,
): Promise<CoverResult> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) return EMPTY;

  let info: Awaited<ReturnType<typeof extractPdfInfo>> = {};
  try {
    onStatus?.("Reading PDF details…");
    info = await extractPdfInfo(file);
  } catch {
    info = {};
  }

  const searchTitle = info.title || fallbackTitle || file.name.replace(/\.[^.]+$/, "");

  try {
    onStatus?.("Looking up book cover…");
    const res = await lookupBookCover({
      data: { isbn: info.isbn ?? null, title: searchTitle ?? null, author: info.author ?? null },
    });
    if (res.found && res.imageBase64) {
      const blob = base64ToBlob(res.imageBase64, res.imageType || "image/jpeg");
      const up = await uploadCoverBlob(blob, batchId);
      if (up) {
        return {
          cover_url: up.url,
          cover_path: up.path,
          cover_source: `${res.source}:${res.matchedBy}`,
          book_author: res.author ?? info.author ?? null,
          book_isbn: res.isbn ?? info.isbn ?? null,
          book_publisher: res.publisher ?? null,
        };
      }
    }
  } catch {
    // metadata API failure must never block upload
  }

  try {
    onStatus?.("Generating page preview…");
    const thumb = await renderFirstPageThumb(file);
    if (thumb) {
      const up = await uploadCoverBlob(thumb, batchId);
      if (up) {
        return {
          ...EMPTY,
          cover_url: up.url,
          cover_path: up.path,
          cover_source: "pdf-first-page",
          book_author: info.author ?? null,
          book_isbn: info.isbn ?? null,
        };
      }
    }
  } catch {
    // fall through to placeholder
  }

  return { ...EMPTY, book_author: info.author ?? null, book_isbn: info.isbn ?? null };
}
