"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  LoaderCircle,
  MoreHorizontal,
  X,
} from "lucide-react";
import { DateFields } from "@/components/inspector/DateFields";
import { dateParts, formatTripDate } from "@/lib/date-utils";
import { oneHourEnd, scheduleKind } from "@/lib/schedule-domain";
import { MarkdownEditor } from "@/components/inspector/MarkdownEditor";
import { api } from "@/lib/api-client";
import { truncateUtf8 } from "@/lib/text-utils";
import { typeColor } from "@/lib/type-color";
import type { TravelAttachment, TravelObject, LocationData, UpdateTravelObjectInput } from "@/types/travel";

const currencies = (Intl as typeof Intl & { supportedValuesOf?: (key: "currency") => string[] }).supportedValuesOf?.(
  "currency",
) ?? ["AUD", "CAD", "CNY", "EUR", "GBP", "INR", "JPY", "SGD", "USD"];
function oneHourAfter(time: string) {
  const value = new Date(`2000-01-01T${time}:00Z`);
  value.setUTCHours(value.getUTCHours() + 1);
  return value.toISOString().slice(11, 16);
}
function normalize24HourTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const compact = trimmed.replace(/\D/g, "");
  const candidate = /^\d{3,4}$/.test(compact)
    ? `${compact.slice(0, -2).padStart(2, "0")}:${compact.slice(-2)}`
    : trimmed;
  const match = candidate.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const hour = Number(match[1]);
  return hour <= 23 ? `${String(hour).padStart(2, "0")}:${match[2]}` : null;
}
function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.ceil(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
const fieldClass =
  "min-w-0 w-full rounded-none border-0 border-b border-input-rule bg-transparent px-0 py-1.5 text-[15px] max-sm:min-h-11 text-foreground outline-none placeholder:text-faint focus:border-foreground focus:ring-0";
const labelClass = "flex min-w-0 flex-col gap-1 text-xs text-muted";
const popupClass = "border border-divider bg-panel shadow-[0_12px_32px_rgb(0_0_0/0.14)]";
const scheduleKinds = [
  ["fixed", "Timed"],
  ["flexible", "Flexible"],
  ["all-day", "All day"],
  ["unscheduled", "Idea"],
] as const;
type ScheduleKind = (typeof scheduleKinds)[number][0];
function safeMapsHref(raw: string, name: string) {
  try {
    const url = new URL(raw);
    if (
      url.protocol === "https:" &&
      (url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl" || url.hostname.endsWith("google.com"))
    )
      return url.toString();
  } catch {
    /* use search link */
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
}
export function ObjectInspectorPanel({
  item,
  timeZone,
  tripStartDate,
  defaultCurrency = "SGD",
  eventTypes,
  typeColors,
  darkMode,
  onClose,
  onChange,
  onRequestDelete,
  onDuplicate,
}: {
  item: TravelObject | null;
  timeZone: string;
  tripStartDate: string;
  defaultCurrency?: string;
  darkMode: boolean;
  eventTypes: string[];
  typeColors: Record<string, string>;
  onClose: () => void;
  onChange: (id: string, patch: UpdateTravelObjectInput, immediate?: boolean) => void;
  onRequestDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [titleDraft, setTitleDraft] = useState(() => item?.title ?? "(untitled event)");
  const [tagDraft, setTagDraft] = useState("");
  const [mapMessage, setMapMessage] = useState("");
  const [editingLink, setEditingLink] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [foldState, setFoldState] = useState<{ id: string | null; open: boolean }>({ id: null, open: false });
  const [resolvingMap, setResolvingMap] = useState(false);
  const [imageError, setImageError] = useState("");
  const [attachments, setAttachments] = useState<TravelAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const currentItem = item;
  const itemId = item?.id;
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  useEffect(() => {
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    const previous = document.activeElement;
    closeButtonRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    void api
      .attachments(itemId)
      .then((result) => {
        if (!cancelled) setAttachments(result);
      })
      .catch((error) => {
        if (!cancelled) setAttachmentError(error instanceof Error ? error.message : "Could not load attachments.");
      })
      .finally(() => {
        if (!cancelled) setLoadingAttachments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);
  useEffect(() => {
    if (!menuOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [menuOpen]);
  // The cost and tags fold starts open only for items that have neither, and keeps its state while they are edited.
  const costFoldDefault = !currentItem?.cost && !currentItem?.tags?.length;
  if (currentItem && foldState.id !== currentItem.id) setFoldState({ id: currentItem.id, open: costFoldDefault });
  if (!currentItem) return null;
  const location = (item.location ?? null) as LocationData | null;
  const cost = item.cost as { amount?: number; currency?: string } | null;
  const defaultYear = dateParts(new Date(), timeZone).date.slice(0, 4);
  const dateValue = item.date?.slice(0, 10) ?? "";
  const endDateValue = item.endDate?.slice(0, 10) ?? dateValue;
  // A same-day item keeps dates and times on one row; the end date shows once it differs or is asked for.
  const showEndDate = endDateOpen || (endDateValue !== "" && endDateValue !== dateValue);
  const startTimeValue = item.startTime ?? "";
  const endTimeValue = item.endTime ?? "";
  const currencySuggestions = currencies
    .filter((code) => code.toLowerCase().includes(currencySearch.toLowerCase()))
    .slice(0, 15);
  function patchDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    onChange(
      currentItem!.id,
      { date: value, ...(endDateValue && endDateValue < value ? { endDate: value } : {}) },
      true,
    );
  }
  function patchEndDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || (dateValue && value < dateValue)) return;
    onChange(currentItem!.id, { endDate: value || dateValue }, true);
  }
  function patchTime(which: "startTime" | "endTime", value: string) {
    const patch: UpdateTravelObjectInput = { [which]: value || null, isAllDay: false };
    if (which === "startTime" && value && (!endTimeValue || value >= endTimeValue)) patch.endTime = oneHourAfter(value);
    onChange(currentItem!.id, patch);
  }
  const kind: ScheduleKind = scheduleKind({
    date: dateValue || null,
    startTime: startTimeValue || null,
    endTime: endTimeValue || null,
    isAllDay: item.isAllDay,
  });
  function changeScheduleKind(next: ScheduleKind) {
    if (next === kind) return;
    if (next === "unscheduled") {
      onChange(currentItem!.id, { date: null, isAllDay: false }, true);
      return;
    }
    const date = dateValue || tripStartDate.slice(0, 10);
    const endDate = endDateValue && endDateValue >= date ? endDateValue : date;
    if (next === "all-day")
      onChange(
        currentItem!.id,
        { date, endDate, startTime: null, endTime: null, placementTime: null, isAllDay: true },
        true,
      );
    else if (next === "flexible")
      onChange(
        currentItem!.id,
        {
          date,
          endDate,
          startTime: null,
          endTime: null,
          placementTime: currentItem!.placementTime ?? "09:00",
          isAllDay: false,
        },
        true,
      );
    else {
      const startTime = startTimeValue || currentItem!.placementTime || "09:00";
      const end =
        startTimeValue && endTimeValue ? { endDate, endTime: endTimeValue } : oneHourEnd(date, startTime, timeZone);
      onChange(
        currentItem!.id,
        { date, endDate: end.endDate, startTime, endTime: end.endTime, placementTime: null, isAllDay: false },
        true,
      );
    }
  }
  function saveHeaderImage(value: string | null) {
    if (value === null) {
      setImageError("");
      setCoverOpen(false);
      onChange(currentItem!.id, { headerImage: null }, true);
      return;
    }
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      setImageError("");
      setCoverOpen(false);
      onChange(currentItem!.id, { headerImage: url.toString() }, true);
    } catch {
      setImageError("Enter a complete http or https image URL.");
    }
  }
  function commitTag(value: string) {
    const nextTags = value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((tag) => tag.slice(0, 50));
    if (!nextTags.length) return;
    const tags = currentItem!.tags ?? [];
    const merged = [...new Set([...tags, ...nextTags])].slice(0, 10);
    if (merged.length !== tags.length || merged.some((tag, index) => tag !== tags[index]))
      onChange(currentItem!.id, { tags: merged });
    setTagDraft("");
  }
  async function resolveMap() {
    const url = location?.googleMapsUrl?.trim();
    if (!url) return;
    setResolvingMap(true);
    setMapMessage("");
    try {
      const result = await api.resolveMapsUrl(url);
      const hasCoordinates = result.lat != null && result.lng != null;
      const foundName = result.name && !location?.name ? result.name : location?.name;
      if (hasCoordinates || foundName !== location?.name)
        onChange(
          currentItem!.id,
          {
            location: {
              ...location,
              name: foundName,
              googleMapsUrl: url,
              ...(hasCoordinates ? { lat: result.lat!, lng: result.lng! } : {}),
            },
          },
          true,
        );
      setMapMessage(
        hasCoordinates
          ? result.coordinateSource === "featureId"
            ? "Approximate coordinates found"
            : "Coordinates found"
          : result.name
            ? "Place name found; this link has no coordinates"
            : "Link saved; no coordinates found",
      );
    } catch {
      setMapMessage("Could not resolve this Google Maps link");
    } finally {
      setResolvingMap(false);
    }
  }
  async function uploadAttachments(files: Iterable<File>) {
    const selected = [...files];
    if (!selected.length) return;
    setUploading(true);
    setAttachmentError("");
    try {
      const uploaded = await Promise.all(selected.map((file) => api.uploadAttachment(currentItem!.id, file)));
      setAttachments((current) => [...uploaded, ...current]);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Could not upload attachment.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  async function removeAttachment(attachment: TravelAttachment) {
    setAttachmentError("");
    try {
      await api.deleteAttachment(currentItem!.id, attachment.id);
      setAttachments((current) => current.filter((entry) => entry.id !== attachment.id));
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Could not remove attachment.");
    }
  }
  const mapsUrl = location?.googleMapsUrl ?? "";
  const placeName = location?.name?.trim() ?? "";
  const pinned = location?.lat != null && location?.lng != null;
  function focusNextEntryField(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const target = event.target;
    if (!(
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ))
      return;
    const fields = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="file"]):not([disabled]), textarea:not([disabled]), [contenteditable="true"]',
      ),
    ];
    const currentIndex = fields.indexOf(target);
    if (currentIndex < 0) return;
    const nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;
    const next = fields[nextIndex];
    if (!next) return;
    event.preventDefault();
    next.focus();
  }
  function handleInspectorKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const target = event.target;
    const editing =
      target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (
      !event.defaultPrevented &&
      !editing &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.key === "Delete" || event.key === "Backspace")
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) onRequestDelete(item!.id);
      return;
    }
    if (!window.matchMedia("(max-width: 639px)").matches) {
      focusNextEntryField(event);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]',
      ),
    ].filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  const dropTarget = (event: ReactDragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");
  const rowLabelClass = "pt-2 text-xs text-muted";
  const timeInput = (which: "startTime" | "endTime") => {
    const value = which === "startTime" ? startTimeValue : endTimeValue;
    const label = which === "startTime" ? "Start time in 24-hour format" : "End time in 24-hour format";
    return (
      <input
        key={`${item.id}:${which}:${value}`}
        aria-label={label}
        type="text"
        inputMode="numeric"
        maxLength={5}
        placeholder="HH:MM"
        defaultValue={value}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={(event) => {
          const next = normalize24HourTime(event.currentTarget.value);
          if (next === null) {
            event.currentTarget.value = value;
            return;
          }
          event.currentTarget.value = next;
          patchTime(which, next);
        }}
        className={`${fieldClass.replace("w-full", "w-16")} text-center font-mono tabular-nums`}
      />
    );
  };
  const summaryDate =
    dateValue && kind !== "unscheduled"
      ? formatTripDate(`${dateValue}T12:00:00Z`, "UTC", { weekday: "short", day: "numeric", month: "short" })
      : "";
  const summaryTime =
    kind === "fixed" && startTimeValue
      ? `${startTimeValue}${endTimeValue ? `–${endTimeValue}` : ""}`
      : kind === "all-day"
        ? "All day"
        : kind === "flexible"
          ? "~flexible"
          : kind === "unscheduled"
            ? "Idea"
            : "";
  const summaryParts = [summaryDate, summaryTime, placeName].filter(Boolean);
  const costSummary = [
    cost?.amount != null ? `${cost.currency ?? defaultCurrency} ${cost.amount.toFixed(2)}` : "",
    item.tags?.length ? `${item.tags.length} ${item.tags.length === 1 ? "tag" : "tags"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const costFoldOpen = foldState.id === item.id ? foldState.open : costFoldDefault;
  const menuItemClass =
    "flex min-h-11 w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-surface sm:min-h-9";
  return (
    <aside
      onKeyDown={handleInspectorKeyDown}
      onDragEnter={(event) => {
        if (!dropTarget(event)) return;
        event.preventDefault();
        if (!uploading) setDragActive(true);
      }}
      onDragOver={(event) => {
        if (dropTarget(event)) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))
          setDragActive(false);
      }}
      onDrop={(event) => {
        if (!dropTarget(event)) return;
        event.preventDefault();
        setDragActive(false);
        if (!uploading) void uploadAttachments(event.dataTransfer.files);
      }}
      onInputCapture={(event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.type === "number") {
          let remainingDigits = 10;
          let decimalSeen = false;
          const sanitized = [...target.value]
            .filter((character) => {
              if (/\d/.test(character)) {
                remainingDigits -= 1;
                return remainingDigits >= 0;
              }
              if (character === "." && !decimalSeen) {
                decimalSeen = true;
                return true;
              }
              return false;
            })
            .join("");
          if (sanitized !== target.value) target.value = sanitized;
        }
      }}
      className={`flex h-full min-h-0 flex-col border-l border-divider bg-panel pt-[env(safe-area-inset-top)] text-[15px] text-foreground outline-offset-[-2px] sm:pt-0 ${dragActive ? "outline-2 outline-solid outline-ring" : ""}`}
    >
      {item.headerImage && (
        <img src={item.headerImage} alt="" className="h-40 w-full shrink-0 bg-surface object-cover" />
      )}
      <div className="flex shrink-0 items-center justify-between px-6 pt-3 sm:pt-5">
        <div className="relative">
          <button
            type="button"
            aria-expanded={typeOpen}
            aria-haspopup="listbox"
            aria-label={`Type: ${item.type}. Change type`}
            onClick={() => setTypeOpen(!typeOpen)}
            className="flex min-h-11 items-center gap-2 text-[13px] capitalize text-foreground sm:min-h-9"
          >
            <span
              aria-hidden
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: typeColor(item.type, typeColors) }}
            />
            {item.type}
            <ChevronDown size={12} aria-hidden className="text-muted" />
          </button>
          {typeOpen && (
            <div
              role="listbox"
              aria-label="Type"
              className={`absolute left-0 top-full z-30 max-h-56 w-52 overflow-y-auto p-1 ${popupClass}`}
            >
              {eventTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="option"
                  aria-selected={type === item.type}
                  onClick={() => {
                    onChange(item.id, { type });
                    setTypeOpen(false);
                  }}
                  className={`flex min-h-11 w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] capitalize hover:bg-surface sm:min-h-0 ${type === item.type ? "bg-surface-selected font-medium" : ""}`}
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-[2px]"
                    style={{ backgroundColor: typeColor(type, typeColors) }}
                  />
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="flex items-center gap-1.5 pr-1 text-xs text-muted">
            <Check size={12} strokeWidth={2.4} aria-hidden />
            Saved
          </span>
          <div
            ref={menuRef}
            className="relative"
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !menuOpen) return;
              event.preventDefault();
              setMenuOpen(false);
              menuButtonRef.current?.focus();
            }}
          >
            <button
              ref={menuButtonRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="More actions"
              onClick={() => setMenuOpen(!menuOpen)}
              className="grid size-11 place-items-center text-foreground hover:bg-surface sm:size-9"
            >
              <MoreHorizontal size={16} strokeWidth={1.5} aria-hidden />
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label="More actions"
                className={`absolute right-0 top-full z-30 w-44 py-1 ${popupClass}`}
              >
                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => {
                    setMenuOpen(false);
                    setCoverOpen(!coverOpen);
                  }}
                >
                  Cover image…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => {
                    setMenuOpen(false);
                    menuButtonRef.current?.focus();
                    onDuplicate(item.id);
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`${menuItemClass} text-danger`}
                  onClick={() => {
                    setMenuOpen(false);
                    onRequestDelete(item.id);
                  }}
                >
                  Delete item
                </button>
              </div>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="grid size-11 place-items-center text-foreground hover:bg-surface sm:size-9"
          >
            <X size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>
      {coverOpen && (
        <div
          className="flex shrink-0 flex-col gap-1 px-6 pt-1.5"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setCoverOpen(false);
            menuButtonRef.current?.focus();
          }}
        >
          <div className="flex items-center gap-3">
            <input
              type="url"
              autoFocus
              defaultValue={item.headerImage ?? ""}
              key={item.id + (item.headerImage ?? "")}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value && value !== item.headerImage) saveHeaderImage(value);
              }}
              placeholder="Cover image URL"
              aria-label="Cover image URL"
              className={`${fieldClass} text-sm`}
            />
            {item.headerImage && (
              <button
                type="button"
                className="min-h-11 shrink-0 text-[13px] text-muted hover:text-danger sm:min-h-0"
                onClick={() => saveHeaderImage(null)}
              >
                Remove
              </button>
            )}
          </div>
          {imageError && <p className="text-xs text-danger">{imageError}</p>}
        </div>
      )}
      <label className="block shrink-0 px-6 pt-1.5">
        <span className="sr-only">Title</span>
        <input
          value={titleDraft}
          maxLength={100}
          onChange={(e) => {
            setTitleDraft(e.target.value);
            if (e.target.value.trim()) onChange(item.id, { title: e.target.value });
          }}
          onBlur={() => {
            if (!titleDraft.trim()) {
              setTitleDraft("(untitled event)");
              onChange(item.id, { title: "(untitled event)" });
            }
          }}
          aria-label="Title"
          className="w-full rounded-none border-0 bg-transparent px-0 pb-1 pt-1 text-[26px] font-medium tracking-[-0.02em] text-foreground outline-none placeholder:text-faint focus:ring-0"
        />
      </label>
      <p className="shrink-0 truncate border-b border-divider px-6 pb-3 text-[13px] text-muted">
        {summaryParts.map((part, index) => (
          <span key={index}>
            {index > 0 && " · "}
            <span className={part === summaryTime && kind === "fixed" ? "font-mono tabular-nums" : ""}>{part}</span>
          </span>
        ))}
      </p>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <section aria-label="When" className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-2 pb-2 pt-[18px]">
          <span className={rowLabelClass}>When</span>
          <div className="flex min-w-0 flex-col gap-2">
            <div role="group" aria-label="Schedule" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {scheduleKinds.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => changeScheduleKind(value)}
                  className={`min-h-11 border-b py-1 sm:min-h-0 ${kind === value ? "border-foreground font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              <div className="w-36 min-w-0">
                <DateFields label="Start date" value={dateValue} defaultYear={defaultYear} onChange={patchDate} />
              </div>
              {(kind === "fixed" || kind === "flexible") && (
                <span className="flex items-end gap-x-3">
                  {timeInput("startTime")}
                  {kind === "fixed" && (
                    <>
                      <span aria-hidden className="pb-2 text-muted">
                        –
                      </span>
                      {timeInput("endTime")}
                    </>
                  )}
                </span>
              )}
            </div>
            {(kind === "fixed" || kind === "all-day") &&
              (showEndDate ? (
                <div className="flex items-end gap-x-3">
                  <span className="pb-2 text-xs text-muted">Ends</span>
                  <div className="w-36 min-w-0">
                    <DateFields
                      label="End date"
                      value={endDateValue}
                      defaultYear={defaultYear}
                      min={dateValue || undefined}
                      onChange={patchEndDate}
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEndDateOpen(true)}
                  className="min-h-11 self-start text-xs text-muted underline underline-offset-3 hover:text-foreground sm:min-h-0"
                >
                  Ends another day
                </button>
              ))}
            {kind === "flexible" && (
              <p className="text-xs text-muted">
                Placed in the day without a booked time. Enter a start time to fix it.
              </p>
            )}
            {kind === "unscheduled" && (
              <p className="text-xs text-muted">
                {startTimeValue && endTimeValue
                  ? `Saved time ${startTimeValue}–${endTimeValue} returns when you pick a date.`
                  : "Enter a date to schedule this item."}
              </p>
            )}
          </div>
        </section>

        <section
          aria-label="Where"
          className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-divider pb-[18px] pt-2"
        >
          <span className={rowLabelClass}>Where</span>
          <div className="flex min-w-0 flex-col gap-1">
            <input
              value={location?.name ?? ""}
              maxLength={300}
              aria-label="Place name"
              onChange={(e) =>
                onChange(currentItem!.id, {
                  location: { ...location, name: e.target.value, googleMapsUrl: location?.googleMapsUrl },
                })
              }
              placeholder="Place name"
              className={fieldClass}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0 text-xs text-muted">
              <span className="inline-flex min-h-11 items-center gap-1.5 sm:min-h-0">
                <span aria-hidden className={`size-2 rounded-full ${pinned ? "bg-accent" : "bg-faint"}`} />
                {pinned ? "Pinned" : "No pin"}
              </span>
              {Boolean(mapsUrl || location?.name) && (
                <a
                  href={safeMapsHref(mapsUrl, location?.name ?? item.title)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-foreground underline underline-offset-3 hover:text-accent sm:min-h-0"
                >
                  Open in Maps
                  <ExternalLink size={12} aria-hidden />
                </a>
              )}
              {mapsUrl && !editingLink && (
                <button
                  type="button"
                  onClick={() => setEditingLink(true)}
                  className="min-h-11 underline underline-offset-3 hover:text-foreground sm:min-h-0"
                >
                  Edit link
                </button>
              )}
            </div>
            {(!mapsUrl || editingLink) && (
              <input
                type="url"
                value={mapsUrl}
                aria-label="Google Maps link"
                autoFocus={editingLink}
                onChange={(e) => onChange(item.id, { location: { ...location, googleMapsUrl: e.target.value } })}
                onBlur={() => {
                  setEditingLink(false);
                  void resolveMap();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                placeholder="Paste a Google Maps link"
                className={`${fieldClass} text-sm`}
              />
            )}
            {(resolvingMap || mapMessage) && (
              <p role="status" className="text-xs text-muted">
                {resolvingMap ? "Looking up place…" : mapMessage}
              </p>
            )}
          </div>
        </section>

        <section aria-label="Notes" className="flex flex-col gap-2 border-b border-divider py-[18px]">
          <h2 className="text-xs font-normal text-muted">Notes</h2>
          <MarkdownEditor
            key={item.id}
            darkMode={darkMode}
            markdown={item.notes ?? ""}
            onChange={(notes) => onChange(item.id, { notes: truncateUtf8(notes, 2500) || null })}
          />
        </section>

        <section aria-label="Attachments" className="flex flex-col gap-1 border-b border-divider py-[18px]">
          <h2 className="text-xs font-normal text-muted">Files</h2>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            aria-label="Attach files"
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.ics,.eml"
            onChange={(event) => void uploadAttachments(event.target.files ?? [])}
          />
          {attachmentError && (
            <p role="alert" className="text-xs text-danger">
              {attachmentError}
            </p>
          )}
          {loadingAttachments ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted">
              <LoaderCircle size={14} className="animate-spin" aria-hidden /> Loading attachments
            </div>
          ) : attachments.length ? (
            <ul className="divide-y divide-divider">
              {attachments.map((attachment) => {
                const attachmentUrl = `/api/travel-objects/${encodeURIComponent(item.id)}/attachments/${encodeURIComponent(attachment.id)}`;
                return (
                  <li key={attachment.id} className="flex items-center gap-3 py-1 text-sm">
                    <FileText size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-muted" />
                    <a
                      href={attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate underline-offset-3 hover:underline"
                      title={`Open ${attachment.fileName}`}
                    >
                      {attachment.fileName}
                    </a>
                    <span className="shrink-0 font-mono text-xs text-muted">{formatFileSize(attachment.size)}</span>
                    <a
                      href={`${attachmentUrl}?download=1`}
                      className="grid min-h-11 shrink-0 place-items-center px-1.5 text-xs text-muted hover:text-foreground sm:min-h-0"
                      aria-label={`Download ${attachment.fileName}`}
                      title="Download"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      className="grid min-h-11 shrink-0 place-items-center px-1.5 text-xs text-muted hover:text-danger sm:min-h-0"
                      onClick={() => void removeAttachment(attachment)}
                      aria-label={`Remove ${attachment.fileName}`}
                      title="Remove"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            title="JPG, PNG, PDF, DOCX, spreadsheets, presentations, TXT, or CSV · up to 20 MB each"
            className="min-h-11 self-start text-[13px] text-muted hover:text-foreground disabled:cursor-wait sm:min-h-8"
          >
            {uploading ? "Attaching files…" : "+ Attach file"}
          </button>
        </section>

        <section aria-label="Cost and tags" className="flex flex-col py-[18px]">
          <button
            type="button"
            aria-expanded={costFoldOpen}
            aria-controls={`cost-tags-${item.id}`}
            onClick={() => setFoldState({ id: item.id, open: !costFoldOpen })}
            className="flex min-h-11 items-center gap-2 text-left text-xs text-muted hover:text-foreground sm:min-h-8"
          >
            <ChevronRight size={12} aria-hidden className={costFoldOpen ? "rotate-90" : ""} />
            Cost &amp; tags
            {costSummary && <span className="ml-auto text-foreground">{costSummary}</span>}
          </button>
          {costFoldOpen && (
            <div
              id={`cost-tags-${item.id}`}
              className="flex flex-col gap-3 pt-3 min-[400px]:grid min-[400px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] min-[400px]:gap-5"
            >
              <div className={labelClass}>
                <label htmlFor={`cost-${item.id}`}>Planned cost</label>
                <div className="relative flex items-baseline gap-2 border-b border-input-rule focus-within:border-foreground">
                  <input
                    id={`cost-${item.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost?.amount ?? ""}
                    onChange={(e) =>
                      onChange(item.id, {
                        cost: e.target.value
                          ? { amount: Number(e.target.value), currency: cost?.currency ?? defaultCurrency }
                          : null,
                      })
                    }
                    placeholder="Amount"
                    className="min-w-0 flex-1 border-0 bg-transparent py-1.5 max-sm:min-h-11 font-mono text-lg font-light text-foreground outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-faint focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <input
                    value={currencySearch || cost?.currency || defaultCurrency}
                    onChange={(e) => {
                      setCurrencySearch(e.target.value.toUpperCase());
                      setCurrencyOpen(true);
                    }}
                    onFocus={() => {
                      setCurrencySearch("");
                      setCurrencyOpen(true);
                    }}
                    maxLength={3}
                    aria-label="Currency"
                    className="w-12 border-0 bg-transparent py-1.5 max-sm:min-h-11 text-right font-mono text-[13px] uppercase text-foreground outline-none focus:ring-0"
                  />
                  <button
                    type="button"
                    aria-label="Show currencies"
                    className="grid size-11 shrink-0 place-items-center self-center text-muted sm:size-7"
                    onClick={() => setCurrencyOpen(!currencyOpen)}
                  >
                    <ChevronDown size={12} aria-hidden />
                  </button>
                  {currencyOpen && (
                    <div
                      role="listbox"
                      aria-label="Currency"
                      className={`absolute right-0 top-full z-30 max-h-48 w-28 overflow-y-auto p-1 ${popupClass}`}
                    >
                      {currencySuggestions.map((code) => (
                        <button
                          key={code}
                          type="button"
                          role="option"
                          aria-selected={cost?.currency === code}
                          onClick={() => {
                            onChange(item.id, {
                              cost: cost?.amount != null ? { amount: cost.amount, currency: code } : null,
                            });
                            setCurrencySearch("");
                            setCurrencyOpen(false);
                          }}
                          className="block min-h-11 w-full px-2 py-1.5 text-left font-mono text-[13px] hover:bg-surface sm:min-h-0"
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 text-xs text-muted">
                Tags
                <div className="flex flex-wrap items-center gap-1.5">
                  {(item.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 border border-input-rule py-0.5 pl-2 pr-1 text-xs text-foreground"
                    >
                      {tag}
                      <button
                        type="button"
                        aria-label={`Remove ${tag} tag`}
                        onClick={() => onChange(item.id, { tags: (item.tags ?? []).filter((entry) => entry !== tag) })}
                        className="relative grid size-5 place-items-center text-muted before:absolute before:-inset-3 before:content-[''] hover:text-danger"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === " " || event.key === "Enter") {
                        event.preventDefault();
                        commitTag(event.currentTarget.value);
                      } else if (event.key === "Backspace" && !event.currentTarget.value && item.tags?.length) {
                        onChange(item.id, { tags: item.tags.slice(0, -1) });
                      }
                    }}
                    onBlur={() => commitTag(tagDraft)}
                    placeholder="+ tag"
                    aria-label="Add tag"
                    className="min-h-8 w-20 max-sm:min-h-11 border border-dashed border-input-rule bg-transparent px-2 py-0.5 text-xs text-foreground outline-none placeholder:text-muted focus:border-foreground focus:placeholder:text-faint"
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
