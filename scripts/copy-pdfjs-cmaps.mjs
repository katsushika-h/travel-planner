// Copies pdf.js character maps into public/ so PDFs with CJK fonts can be read without a CDN.
// Runs before dev and build; the output is git-ignored and always matches the installed pdfjs-dist.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve("pdfjs-dist/package.json")), "cmaps");
const target = join(process.cwd(), "public", "pdfjs", "cmaps");

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
