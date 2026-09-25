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
