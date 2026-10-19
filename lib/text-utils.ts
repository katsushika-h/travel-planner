/** Keep a UTF-8 byte limit without splitting a Unicode character. */
export function truncateUtf8(value: string, maxBytes: number) {
  const encoder = new TextEncoder();
  let result = "";
  let byteLength = 0;
  for (const character of value) {
    const characterBytes = encoder.encode(character).byteLength;
    if (byteLength + characterBytes > maxBytes) break;
    result += character;
    byteLength += characterBytes;
  }
  return result;
}

/** Reduce Markdown notes to plain text for read-only previews; stored notes are untouched. */
export function markdownToPlainText(value: string) {
  return value
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s*\\?\[(?:\[?\d+\]\([^)]*\)[,\s]*)+\]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|==|~~)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?![\w*])/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!>~=|])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
