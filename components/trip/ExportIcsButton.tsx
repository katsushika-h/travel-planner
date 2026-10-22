"use client";

import { Download } from "lucide-react";
import { menuItemClassName } from "@/components/ui/menu-item";
import { createTripIcs } from "@/lib/ics-export";
import type { TravelObject, Trip } from "@/types/travel";

export function ExportIcsButton({ trip, items }: { trip: Trip; items: TravelObject[] }) {
  function download() {
    const calendar = createTripIcs(trip, items);
    const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
      trip.title
        .trim()
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .replace(/^-+|-+$/g, "") || "trip"
    }.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <button type="button" className={menuItemClassName} onClick={download}>
      <Download /> Calendar (.ics)
    </button>
  );
}
