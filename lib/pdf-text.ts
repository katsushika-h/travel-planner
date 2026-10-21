import { pdfWordsFromItems, type PdfText, type PdfTextItem } from "./pdf-reservation.ts";

/** The parts of a pdf.js document this app reads. */
interface PdfDocumentLike {
  numPages: number;
  getPage(page: number): Promise<{
    getViewport(options: { scale: number }): { height: number };
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
  getMetadata(): Promise<{ info: unknown }>;
}

const MAX_PAGES = 30;

/** Reads positioned words from a loaded pdf.js document. Shared by the browser and the Node test harness. */
export async function pdfTextFromDocument(pdf: PdfDocumentLike): Promise<PdfText> {
  const pageHeights: number[] = [];
  const words: PdfText["words"] = [];
  for (let number = 1; number <= Math.min(pdf.numPages, MAX_PAGES); number += 1) {
    const page = await pdf.getPage(number);
    const height = page.getViewport({ scale: 1 }).height;
    pageHeights.push(height);
    const items = (await page.getTextContent()).items.filter(
      (item): item is PdfTextItem => typeof item === "object" && item !== null && "str" in item,
    );
    words.push(...pdfWordsFromItems(items, number, height));
  }
  const info = (await pdf.getMetadata().catch(() => ({ info: {} }))).info as Record<string, unknown> | null;
  const producer = `${info?.Creator ?? ""} ${info?.Producer ?? ""}`;
  return { pageHeights, words, ocrLayer: /\b(ocrmypdf|tesseract|abbyy|ocr)\b/i.test(producer) };
}

/**
 * Reads a PDF in the browser. pdf.js and its worker load only when a PDF is chosen, and the file never
 * leaves the device. Scripts embedded in the PDF never run: only text is read.
 */
export async function readPdfText(data: ArrayBuffer): Promise<PdfText> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerPort)
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), {
      type: "module",
    });
  // Character maps for CJK fonts are served from public/ (scripts/copy-pdfjs-cmaps.mjs), never a CDN.
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    enableXfa: false,
  });
  try {
    const pdf = await task.promise;
    return await pdfTextFromDocument(pdf);
  } catch (cause) {
    if (cause instanceof Error && cause.name === "PasswordException")
      throw new Error("This PDF is password-protected. Remove the password and try again.");
    throw new Error("Could not read this PDF.");
  } finally {
    await task.destroy();
  }
}
