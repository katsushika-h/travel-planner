import { Footprints } from "lucide-react";
import { formatDistance, formatDuration, type TravelLeg } from "@/lib/travel-legs";

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

/** Straight-line walking estimate to the next stop; transfers render nothing. */
export function LegLine({ leg, nextTitle }: { leg: TravelLeg; nextTitle: string }) {
  if (leg.status === "transfer") return null;
  let label: string;
  let text: string;
  let walking = false;
  if (leg.status === "unmapped") {
    label = `Distance to ${nextTitle} unknown`;
    text = "No location — distance unknown";
  } else if (!leg.walkable) {
    label = `${spokenDistance(leg.meters)} to ${nextTitle}, too far to walk`;
    text = formatDistance(leg.meters);
  } else {
    walking = true;
    label = `About ${spokenDuration(leg.seconds)} walking, ${spokenDistance(leg.meters)} to ${nextTitle}`;
    text = `~${formatDuration(leg.seconds)} · ${formatDistance(leg.meters)}`;
  }
  return (
    <p className="flex min-w-0 items-center gap-1.5 pb-3 text-[13px] text-muted sm:pl-[156px] in-data-[density=compact]:pb-1.5">
      <span className="sr-only">{label}</span>
      {walking && <Footprints aria-hidden="true" className="size-3.5 shrink-0" />}
      <span aria-hidden="true" className="truncate">
        {text}
      </span>
    </p>
  );
}
