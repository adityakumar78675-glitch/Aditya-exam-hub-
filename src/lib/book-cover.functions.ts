import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  isbn: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  author: z.string().optional().nullable(),
});

export type BookCoverResult = {
  found: boolean;
  source?: "google-books" | "open-library";
  matchedBy?: "isbn" | "title" | "title+author";
  title?: string | null;
  author?: string | null;
  publisher?: string | null;
  isbn?: string | null;
  /** base64 (no data: prefix) of a small cover thumbnail */
  imageBase64?: string | null;
  imageType?: string | null;
};

function norm(s?: string | null) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function fetchImage(url: string): Promise<{ base64: string; type: string } | null> {
  try {
    const res = await fetch(url.replace(/^http:/, "https:"));
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    // Skip absurdly large images (covers should be small thumbnails)
    if (buf.byteLength > 2_000_000 || buf.byteLength < 500) return null;
    let bin = "";
    for (let i = 0; i < buf.length; i += 8192) {
      bin += String.fromCharCode(...buf.subarray(i, i + 8192));
    }
    return { base64: btoa(bin), type };
  } catch {
    return null;
  }
}

async function googleBooks(query: string) {
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?maxResults=5&printType=books&q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) return [] as any[];
  const json: any = await res.json();
  return (json.items ?? []) as any[];
}

async function openLibrary(query: string) {
  const res = await fetch(
    `https://openlibrary.org/search.json?limit=5&q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) return [] as any[];
  const json: any = await res.json();
  return (json.docs ?? []) as any[];
}

export const lookupBookCover = createServerFn({ method: "POST" })
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<BookCoverResult> => {
    const isbn = (data.isbn || "").replace(/[^0-9Xx]/g, "");
    const title = (data.title || "").trim();
    const author = (data.author || "").trim();

    const attempts: { q: string; matchedBy: BookCoverResult["matchedBy"]; strict: boolean }[] = [];
    if (isbn.length === 10 || isbn.length === 13) attempts.push({ q: `isbn:${isbn}`, matchedBy: "isbn", strict: false });
    if (title && author) attempts.push({ q: `intitle:${title} inauthor:${author}`, matchedBy: "title+author", strict: true });
    if (title) attempts.push({ q: `intitle:${title}`, matchedBy: "title", strict: true });

    for (const attempt of attempts) {
      try {
        const items = await googleBooks(attempt.q);
        for (const item of items) {
          const info = item.volumeInfo ?? {};
          if (attempt.strict && title) {
            const a = norm(info.title);
            const b = norm(title);
            if (!a || !(a === b || a.startsWith(b) || b.startsWith(a))) continue;
          }
          const thumb: string | undefined =
            info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
          if (!thumb) continue;
          const img = await fetchImage(thumb);
          if (!img) continue;
          return {
            found: true,
            source: "google-books",
            matchedBy: attempt.matchedBy,
            title: info.title ?? title,
            author: (info.authors ?? []).join(", ") || author || null,
            publisher: info.publisher ?? null,
            isbn:
              (info.industryIdentifiers ?? []).find((i: any) => i.type === "ISBN_13")?.identifier ??
              (info.industryIdentifiers ?? [])[0]?.identifier ??
              isbn ??
              null,
            imageBase64: img.base64,
            imageType: img.type,
          };
        }
      } catch {
        // continue to next strategy
      }
    }

    // Open Library fallback
    try {
      if (isbn.length === 10 || isbn.length === 13) {
        const img = await fetchImage(`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`);
        if (img) {
          return {
            found: true,
            source: "open-library",
            matchedBy: "isbn",
            title: title || null,
            author: author || null,
            isbn,
            imageBase64: img.base64,
            imageType: img.type,
          };
        }
      }
      if (title) {
        const docs = await openLibrary(author ? `${title} ${author}` : title);
        for (const doc of docs) {
          const a = norm(doc.title);
          const b = norm(title);
          if (!a || !(a === b || a.startsWith(b) || b.startsWith(a))) continue;
          if (!doc.cover_i) continue;
          const img = await fetchImage(`https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`);
          if (!img) continue;
          return {
            found: true,
            source: "open-library",
            matchedBy: author ? "title+author" : "title",
            title: doc.title,
            author: (doc.author_name ?? []).join(", ") || author || null,
            publisher: (doc.publisher ?? [])[0] ?? null,
            isbn: (doc.isbn ?? [])[0] ?? null,
            imageBase64: img.base64,
            imageType: img.type,
          };
        }
      }
    } catch {
      // ignore
    }

    return { found: false };
  });
