"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createTripIcs } from "@/lib/ics-export";
import type { TravelObject, Trip } from "@/types/travel";

export function ExportIcsButton({ trip, items, compact = false }: { trip: Trip; items: TravelObject[]; compact?: boolean }) {
  function download() {
    const calendar = createTripIcs(trip, items);
    const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${trip.title.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "trip"}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <Button type="button" variant="ghost" size={compact ? "icon" : "sm"} className={compact ? "mx-auto" : "w-full justify-start"} aria-label="Export calendar (.ics)" title={compact ? "Export calendar (.ics)" : undefined} onClick={download}><Download />{!compact && "Export calendar (.ics)"}</Button>;
}
