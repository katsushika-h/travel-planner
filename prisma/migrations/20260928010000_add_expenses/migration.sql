CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "travelObjectId" TEXT,
    "description" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(13,3) NOT NULL,
    "currency" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Expense_amount_positive" CHECK ("amount" > 0)
);

CREATE INDEX "Expense_tripId_date_idx" ON "Expense"("tripId", "date");
CREATE INDEX "Expense_tripId_category_idx" ON "Expense"("tripId", "category");
CREATE INDEX "Expense_travelObjectId_idx" ON "Expense"("travelObjectId");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_travelObjectId_fkey" FOREIGN KEY ("travelObjectId") REFERENCES "TravelObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
