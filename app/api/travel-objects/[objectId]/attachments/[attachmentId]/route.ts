import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ objectId: string; attachmentId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { objectId, attachmentId } = await params;
  const attachment = await prisma.travelAttachment.findFirst({ where: { id: attachmentId, travelObjectId: objectId } });
  if (!attachment) return Response.json({ error: "Attachment not found." }, { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "Content-Length": String(attachment.size),
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { objectId, attachmentId } = await params;
  const result = await prisma.travelAttachment.deleteMany({ where: { id: attachmentId, travelObjectId: objectId } });
  return result.count ? new Response(null, { status: 204 }) : Response.json({ error: "Attachment not found." }, { status: 404 });
}
