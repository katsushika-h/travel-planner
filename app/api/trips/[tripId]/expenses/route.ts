import { readExpenseFields } from "@/lib/expense-validation";
import { serializeExpense } from "@/lib/expense-serialization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ tripId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { tripId } = await params;
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
  if (!trip) return Response.json({ error: "Trip not found." }, { status: 404 });
  const expenses = await prisma.expense.findMany({ where: { tripId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  return Response.json(expenses.map(serializeExpense));
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { tripId } = await params;
    const body: unknown = await request.json().catch(() => null);
    const data = readExpenseFields(body, "create");
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
    if (!trip) return Response.json({ error: "Trip not found." }, { status: 404 });
    if (data.travelObjectId) {
      const linked = await prisma.travelObject.findUnique({ where: { id: data.travelObjectId }, select: { tripId: true } });
      if (linked?.tripId !== tripId) return Response.json({ error: "Linked item must belong to this trip." }, { status: 400 });
    }
    const expense = await prisma.expense.create({ data: { tripId, ...data } });
    return Response.json(serializeExpense(expense), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid expense data." }, { status: 400 });
  }
}
