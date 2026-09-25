export type DefaultEventType =
  | "commute"
  | "food"
  | "hotel"
  | "flight"
  | "activity"
  | "sightseeing";

export type EventType = DefaultEventType | (string & {});

export interface LocationData {
  name?: string;
  address?: string;
  googleMapsUrl?: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  openingHours?: string[];
}

export interface CostData {
  amount: number;
  currency: string;
}

export interface TravelAttachment {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export interface Trip {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  timezone: string;
  defaultCurrency: string;
  createdAt: string;
}

export interface TravelObject {
  id: string;
  tripId: string;
  title: string;
  type: EventType;
  date: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  /** A 15-minute Week-view placement for flexible items; never a committed event time. */
  placementTime: string | null;
  dayOrder: number | null;
  isAllDay: boolean;
  headerImage?: string | null;
  location?: LocationData | null;
  cost?: CostData | null;
  notes?: string | null;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

type TravelObjectWriteFields = Pick<TravelObject,
  "title" | "type" | "date" | "endDate" | "startTime" | "endTime" | "placementTime" |
  "dayOrder" | "isAllDay" |
  "headerImage" | "location" | "cost" | "notes" | "tags"
>;

/** Client request shape using canonical schedule fields. */
export type CreateTravelObjectInput = Pick<TravelObject, "tripId" | "title" | "type" | "isAllDay"> & Partial<TravelObjectWriteFields>;

/** Excludes server-owned response fields. */
export type UpdateTravelObjectInput = Partial<TravelObjectWriteFields>;
