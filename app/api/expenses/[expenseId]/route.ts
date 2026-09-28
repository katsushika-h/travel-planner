import { readExpenseFields } from "@/lib/expense-validation";
import { serializeExpense } from "@/lib/expense-serialization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ expenseId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { expenseId } = await params;
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  return expense ? Response.json(serializeExpense(expense)) : Response.json({ error: "Expense not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { expenseId } = await params;
    const body: unknown = await request.json().catch(() => null);
    const data = readExpenseFields(body, "update");
    const existing = await prisma.expense.findUnique({ where: { id: expenseId }, select: { tripId: true } });
    if (!existing) return Response.json({ error: "Expense not found." }, { status: 404 });
    if (data.travelObjectId) {
      const linked = await prisma.travelObject.findUnique({ where: { id: data.travelObjectId }, select: { tripId: true } });
      if (linked?.tripId !== existing.tripId) return Response.json({ error: "Linked item must belong to this trip." }, { status: 400 });
    }
    const expense = await prisma.expense.update({ where: { id: expenseId }, data });
    return Response.json(serializeExpense(expense));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid expense data." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { expenseId } = await params;
  const existing = await prisma.expense.findUnique({ where: { id: expenseId }, select: { id: true } });
  if (!existing) return Response.json({ error: "Expense not found." }, { status: 404 });
  await prisma.expense.delete({ where: { id: expenseId } });
  return new Response(null, { status: 204 });
}
