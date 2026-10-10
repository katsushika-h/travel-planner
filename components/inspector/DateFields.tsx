"use client";

import { useId, useState } from "react";

function dateFields(value: string, defaultYear: string) {
  const [year, month = "", day = ""] = value.split("-");
  return { value, day, month, year: year || defaultYear, error: "" };
}

export function DateFields({ label, value, defaultYear, min, onChange }: { label: string; value: string; defaultYear: string; min?: string; onChange: (date: string) => void }) {
  const errorId = useId();
  const [draft, setDraft] = useState(() => dateFields(value, defaultYear));
  // Sync external schedule changes without remounting inputs or losing focus.
  if (draft.value !== value) setDraft(dateFields(value, defaultYear));

  function commit() {
    if (!draft.day || !draft.month) return;
    const year = draft.year || defaultYear;
    const day = draft.day.padStart(2, "0");
    const month = draft.month.padStart(2, "0");
    const date = `${year}-${month}-${day}`;
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
      setDraft({ ...draft, error: "Enter a valid day, month and four-digit year." });
      return;
    }
    if (min && date < min) {
      setDraft({ ...draft, error: "End date must be on or after start date." });
      return;
    }
    setDraft({ ...draft, day, month, year, error: "" });
    if (date !== value) onChange(date);
  }

  return <div role="group" aria-label={label} className="min-w-0">
    <div className="grid grid-cols-[minmax(0,2fr)_auto_minmax(0,2fr)_auto_minmax(0,4fr)] items-center gap-0.5">
      {(["day", "month", "year"] as const).map((part, index) => <span key={part} className="contents">
        {index > 0 && <span aria-hidden className="text-xs text-muted-foreground">/</span>}
        <input type="text" inputMode="numeric" aria-label={`${label} ${part}`} aria-invalid={Boolean(draft.error)} aria-describedby={draft.error ? errorId : undefined} placeholder={part === "year" ? "YYYY" : part === "month" ? "MM" : "DD"} maxLength={part === "year" ? 4 : 2} value={draft[part]} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setDraft({ ...draft, [part]: event.target.value.replace(/\D/g, ""), error: "" })} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} className="min-h-11 min-w-0 w-full border-0 bg-transparent px-0 py-1 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-emerald-600 sm:min-h-0 sm:text-sm" />
      </span>)}
    </div>
    {draft.error && <p id={errorId} role="alert" className="mt-1 text-[10px] text-destructive">{draft.error}</p>}
  </div>;
}
