import { Car, Footprints } from "lucide-react";
import type { DisplayLeg, DisplaySegment, TravelMode } from "@/lib/routed-legs";
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

/** Visible and screen-reader text for one Drive-mode segment. */
function segmentText(segment: DisplaySegment, nextTitle: string) {
  const meters = segment.meters;
  const seconds = segment.seconds;
  const estimate = segment.state === "estimate";
  if (segment.mode === "drive") {
    if (seconds === undefined) {
      return {
        label: `About ${spokenDistance(meters)} straight-line to ${nextTitle} by car, driving time unavailable`,
        text: `~${formatDistance(meters)}`,
      };
    }
    return {
      label: `${spokenDuration(seconds)} driving, ${spokenDistance(meters)} to ${nextTitle}`,
      text: `${formatDuration(seconds)} · ${formatDistance(meters)}`,
    };
  }
  const time = seconds ?? 0;
  const about = estimate ? "About " : "";
  const tilde = estimate ? "~" : "";
  if (segment.role === "to-car") {
    return {
      label: `${about}${spokenDuration(time)} walking back to the car`,
      text: `${tilde}${formatDuration(time)} walk back to the car`,
    };
  }
  if (segment.role === "from-parking") {
    return {
      label: `${about}${spokenDuration(time)} walking from the car park`,
      text: `${tilde}${formatDuration(time)} walk from the car park`,
    };
  }
  return {
    label: `${about}${spokenDuration(time)} walking, ${spokenDistance(meters)} to ${nextTitle}`,
    text: `${tilde}${formatDuration(time)} · ${formatDistance(meters)}`,
  };
}

const rowClass = "min-w-0 text-[13px] text-muted sm:pl-[156px]";

function ModeToggle({
  leg,
  nextTitle,
  onSetMode,
}: {
  leg: DisplayLeg;
  nextTitle: string;
  onSetMode: (mode: TravelMode) => void;
}) {
  return (
    <div role="group" aria-label={`Travel to ${nextTitle}`} className="flex shrink-0 border border-divider">
      {(["walk", "drive"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={leg.mode === option}
          onClick={() => onSetMode(option)}
          className={`min-h-8 px-2 text-xs ${leg.mode === option ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
        >
          {option === "walk" ? "Walk" : "Drive"}
        </button>
      ))}
    </div>
  );
}

/** Drive-mode leg: the main travel line plus muted walks to and from the car, with a walk/drive override. */
function PlannedLegLine({
  leg,
  nextTitle,
  onSetMode,
}: {
  leg: DisplayLeg;
  nextTitle: string;
  onSetMode?: (mode: TravelMode) => void;
}) {
  const segments = leg.segments ?? [];
  return (
    <div
      className={`${rowClass} flex flex-wrap items-start justify-between gap-x-3 gap-y-1 pb-3 in-data-[density=compact]:pb-1.5`}
    >
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
        {segments.map((segment, index) => {
          const { label, text } = segmentText(segment, nextTitle);
          if (segment.role !== "leg") {
            return (
              <p key={index} className="min-w-0 truncate text-xs">
                <span className="sr-only">{label}</span>
                <span aria-hidden="true">{text}</span>
              </p>
            );
          }
          const Icon = segment.mode === "drive" ? Car : Footprints;
          return (
            <p key={index} className="flex min-w-0 items-center gap-1.5">
              <span className="sr-only">{label}</span>
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              <span aria-hidden="true" className="truncate">
                {text}
              </span>
            </p>
          );
        })}
      </div>
      {onSetMode && <ModeToggle leg={leg} nextTitle={nextTitle} onSetMode={onSetMode} />}
    </div>
  );
}

/** Routed or estimated travel to the next stop; transfers render nothing. */
export function LegLine({
  leg,
  nextTitle,
  onSetMode,
}: {
  leg: DisplayLeg;
  nextTitle: string;
  /** Drive mode only: sets this leg's walk/drive choice. */
  onSetMode?: (mode: TravelMode) => void;
}) {
  if (leg.kind === "transfer") return null;
  if (leg.kind === "planned") return <PlannedLegLine leg={leg} nextTitle={nextTitle} onSetMode={onSetMode} />;
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
    <p className={`${rowClass} flex items-center gap-1.5 pb-3 in-data-[density=compact]:pb-1.5`}>
      <span className="sr-only">{label}</span>
      {icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
      <span aria-hidden="true" className="truncate">
        {text}
      </span>
    </p>
  );
}
