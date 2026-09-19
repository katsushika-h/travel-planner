import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ objectId: string }> };

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const allowedExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"]);
const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 180);

export async function GET(_request: Request, { params }: Context) {
  const { objectId } = await params;
  const attachments = await prisma.travelAttachment.findMany({
    where: { travelObjectId: objectId },
    select: { id: true, fileName: true, contentType: true, size: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return Response.json(attachments);
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { objectId } = await params;
    const travelObject = await prisma.travelObject.findUnique({ where: { id: objectId }, select: { id: true } });
    if (!travelObject) return Response.json({ error: "Travel object not found." }, { status: 404 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a non-empty file to attach.");
    if (file.size > MAX_FILE_SIZE) throw new Error("Attachments must be 20 MB or smaller.");
    const fileName = safeFileName(file.name);
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (!fileName || !extension || !allowedExtensions.has(extension)) throw new Error("Supported formats: JPG, PNG, PDF, DOCX, spreadsheets, presentations, TXT, and CSV.");

    const attachment = await prisma.travelAttachment.create({
      data: { travelObjectId: objectId, fileName, contentType: file.type || "application/octet-stream", size: file.size, data: new Uint8Array(await file.arrayBuffer()) },
      select: { id: true, fileName: true, contentType: true, size: true, createdAt: true },
    });
    return Response.json(attachment, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not upload attachment." }, { status: 400 });
  }
}
