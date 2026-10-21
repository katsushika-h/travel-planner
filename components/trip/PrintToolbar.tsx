"use client";

import { Download } from "lucide-react";
import { useEffect } from "react";

/** Screen-only controls on the printable itinerary; opens the print dialog once on load. */
export function PrintToolbar() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="trip-print-toolbar">
      <button type="button" onClick={() => window.print()}>
        <Download className="mr-1 inline size-4 align-[-3px]" />
        Save as PDF
      </button>
    </div>
  );
}
