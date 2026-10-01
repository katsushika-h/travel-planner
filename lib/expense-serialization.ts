import type { Expense as PrismaExpense } from "@prisma/client";
import type { Expense } from "@/types/travel";

export function serializeExpense(expense: PrismaExpense): Expense {
  return {
    id: expense.id,
    tripId: expense.tripId,
    travelObjectId: expense.travelObjectId,
    description: expense.description,
    date: expense.date.toISOString().slice(0, 10),
    amount: expense.amount.toFixed(3),
    currency: expense.currency,
    category: expense.category as Expense["category"],
    notes: expense.notes,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}
