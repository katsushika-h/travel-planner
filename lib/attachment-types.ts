/** Served types for allowed attachment extensions; never trust the uploader's declared type. */
const contentTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};

export function attachmentExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension && Object.hasOwn(contentTypes, extension) ? extension : null;
}

/** Derive the content type from the file name so stored files cannot be served as HTML or script. */
export function attachmentContentType(fileName: string) {
  const extension = attachmentExtension(fileName);
  return extension ? contentTypes[extension] : "application/octet-stream";
}
