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
  startDateTime: string;
  endDateTime: string;
  dayIndex: number;
  isAllDay: boolean;
  headerImage?: string | null;
  location?: LocationData | null;
  cost?: CostData | null;
  notes?: string | null;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}
