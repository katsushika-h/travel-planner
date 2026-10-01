import { isRecord, readTrimmedString } from "./api-validation.ts";
import { EXPENSE_CATEGORIES, decimalToThousandths } from "./expense-domain.ts";
import type { ExpenseCategory } from "../types/travel.ts";

type ExpenseFields = {
  description: string;
  date: Date;
  amount: string;
  currency: string;
  category: ExpenseCategory;
  notes: string | null;
  travelObjectId: string | null;
};

function readExpenseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("date must be a valid YYYY-MM-DD date.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("date must be a valid YYYY-MM-DD date.");
  return date;
}

function readExpenseAmount(value: unknown) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(value) || decimalToThousandths(value) === BigInt(0)) {
    throw new Error("amount must be a positive decimal string with at most 10 whole and 3 fractional digits.");
  }
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(3, "0")}`;
}

function readExpenseCurrency(value: unknown) {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) throw new Error("currency must be a three-letter currency code.");
  return value;
}

function readExpenseCategory(value: unknown): ExpenseCategory {
  if (typeof value !== "string" || !EXPENSE_CATEGORIES.includes(value as ExpenseCategory)) throw new Error("category must be a supported expense category.");
  return value as ExpenseCategory;
}

export function readExpenseFields(body: unknown, mode: "create"): ExpenseFields;
export function readExpenseFields(body: unknown, mode: "update"): Partial<ExpenseFields>;
export function readExpenseFields(body: unknown, mode: "create" | "update") {
  if (!isRecord(body)) throw new Error("Request body must be a JSON object.");
  const creating = mode === "create";
  const data: Partial<ExpenseFields> = {};
  if (creating || body.description !== undefined) data.description = readTrimmedString(body.description, "description", { maxLength: 100 })!;
  if (creating || body.date !== undefined) data.date = readExpenseDate(body.date);
  if (creating || body.amount !== undefined) data.amount = readExpenseAmount(body.amount);
  if (creating || body.currency !== undefined) data.currency = readExpenseCurrency(body.currency);
  if (creating || body.category !== undefined) data.category = readExpenseCategory(body.category);
  if (creating || body.notes !== undefined) data.notes = body.notes === null || body.notes === "" ? null : readTrimmedString(body.notes, "notes", { maxBytes: 2500 })!;
  if (creating || body.travelObjectId !== undefined) data.travelObjectId = body.travelObjectId === null || (creating && body.travelObjectId === undefined) ? null : readTrimmedString(body.travelObjectId, "travelObjectId", { maxLength: 100 })!;
  if (!creating && Object.keys(data).length === 0) throw new Error("Provide at least one field to update.");
  return data;
}
