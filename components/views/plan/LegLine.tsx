import { Car, Footprints } from "lucide-react";
import type { DisplayLeg } from "@/lib/routed-legs";
import { formatDistance, formatDuration } from "@/lib/travel-legs";

function spokenDuration(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [];
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (rest) parts.push(`${rest} ${rest === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

function spokenDistance(meters: number) {
  const rounded = Math.round(meters / 10) * 10;
  if (rounded < 1000) return `${rounded} metres`;
  return `${(meters / 1000).toFixed(1)} kilometres`;
}

/** Routed or estimated travel to the next stop; transfers render nothing. */
export function LegLine({ leg, nextTitle }: { leg: DisplayLeg; nextTitle: string }) {
  if (leg.kind === "transfer") return null;
  const meters = leg.meters ?? 0;
  const seconds = leg.seconds ?? 0;
  let label: string;
  let text: string;
  let icon: "walk" | "drive" | null = null;
  if (leg.kind === "unmapped") {
    label = `Distance to ${nextTitle} unknown`;
    text = "No location — distance unknown";
  } else if (leg.kind === "far") {
    label = `${spokenDistance(meters)} to ${nextTitle}, too far to walk`;
    text = formatDistance(meters);
  } else if (leg.kind === "routed") {
    icon = leg.mode;
    const verb = leg.mode === "drive" ? "driving" : "walking";
    label = `${spokenDuration(seconds)} ${verb}, ${spokenDistance(meters)} to ${nextTitle}`;
    text = `${formatDuration(seconds)} · ${formatDistance(meters)}`;
  } else {
    icon = "walk";
    label = `About ${spokenDuration(seconds)} walking, ${spokenDistance(meters)} to ${nextTitle}`;
    text = `~${formatDuration(seconds)} · ${formatDistance(meters)}`;
  }
  const Icon = icon === "drive" ? Car : Footprints;
  return (
    <p className="flex min-w-0 items-center gap-1.5 pb-3 text-[13px] text-muted sm:pl-[156px] in-data-[density=compact]:pb-1.5">
      <span className="sr-only">{label}</span>
      {icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
      <span aria-hidden="true" className="truncate">
        {text}
      </span>
    </p>
  );
}
