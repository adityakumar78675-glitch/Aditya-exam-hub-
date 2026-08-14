/** Client-only helpers: read PDF metadata and render a first-page thumbnail. */

export type PdfInfo = {
  title?: string | null;
  author?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  subject?: string | null;
};

async function getPdfjs() {
  const pdfjs: any = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

function findIsbn(text: string): string | null {
  const m = text.match(/ISBN[-\s]*(?:13|10)?[:\s]*((?:97[89][-\s]?)?[\d][\d\-\s]{8,16}[\dXx])/i);
  if (!m) return null;
  const raw = m[1].replace(/[^0-9Xx]/g, "");
  return raw.length === 10 || raw.length === 13 ? raw : null;
}

/** Extract metadata + best-effort ISBN/title from the first pages of a PDF file. */
export async function extractPdfInfo(file: File): Promise<PdfInfo> {
  try {
    const pdfjs = await getPdfjs();
    const buf = await file.slice(0, Math.min(file.size, 12 * 1024 * 1024)).arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const meta = await doc.getMetadata().catch(() => null);
    const info: any = meta?.info ?? {};

    let text = "";
    const pages = Math.min(doc.numPages, 3);
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      text += " " + content.items.map((i: any) => i.str).join(" ");
    }

    const isbn = findIsbn(text);
    let title: string | null = (info.Title || "").trim() || null;
    if (!title) {
      // First reasonably long line of the first page
      const line = text
        .split(/\s{2,}|\n/)
        .map((s) => s.trim())
        .find((s) => s.length > 6 && s.length < 90 && /[a-zA-Z]{4}/.test(s));
      title = line || null;
    }

    await doc.destroy?.();
    return {
      title,
      author: (info.Author || "").trim() || null,
      publisher: (info.Producer || "").trim() || null,
      subject: (info.Subject || "").trim() || null,
      isbn,
    };
  } catch {
    return {};
  }
}

/** Render page 1 of a PDF to a JPEG blob (max width ~420px). */
export async function renderFirstPageThumb(file: File): Promise<Blob | null> {
  try {
    const pdfjs = await getPdfjs();
    const buf = await file.slice(0, Math.min(file.size, 12 * 1024 * 1024)).arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 420 / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    await doc.destroy?.();
    return blob;
  } catch {
    return null;
  }
}

export function base64ToBlob(base64: string, type: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
