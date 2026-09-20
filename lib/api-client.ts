import type { TravelAttachment, TravelObject, Trip } from "@/types/travel";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (cause) {
    if (cause instanceof TypeError) {
      throw new Error("Unable to reach the trip service. Check your connection and try again.");
    }
    throw cause;
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Request failed.");
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export const api = {
  trips: () => request<Trip[]>("/api/trips"),
  createTrip: (data: Pick<Trip, "title" | "startDate" | "endDate" | "timezone"> & Partial<Pick<Trip, "defaultCurrency">>) =>
    request<Trip>("/api/trips", { method: "POST", body: JSON.stringify(data) }),
  updateTrip: (id: string, data: Partial<Pick<Trip, "title" | "startDate" | "endDate" | "timezone" | "defaultCurrency">>) =>
    request<Trip>(`/api/trips/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  objects: (tripId: string) =>
    request<TravelObject[]>(`/api/travel-objects?tripId=${encodeURIComponent(tripId)}`),
  createObject: (data: Omit<TravelObject, "id" | "createdAt" | "updatedAt" | "dayOrder"> & { dayOrder?: number | null }) =>
    request<TravelObject>("/api/travel-objects", { method: "POST", body: JSON.stringify(data) }),
  updateObject: (id: string, data: Partial<TravelObject>) =>
    request<TravelObject>(`/api/travel-objects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  reorderObjects: (data: { tripId: string; objectId: string; dayIndex: number; dayOrder: number; clearTime?: boolean }) =>
    request<TravelObject[]>("/api/travel-objects/reorder", { method: "POST", body: JSON.stringify(data) }),
  deleteObject: (id: string) =>
    request<void>(`/api/travel-objects/${id}`, { method: "DELETE" }),
  attachments: (objectId: string) =>
    request<TravelAttachment[]>(`/api/travel-objects/${encodeURIComponent(objectId)}/attachments`),
  uploadAttachment: async (objectId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`/api/travel-objects/${encodeURIComponent(objectId)}/attachments`, { method: "POST", body, credentials: "same-origin" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Could not upload attachment.");
    }
    return response.json() as Promise<TravelAttachment>;
  },
  deleteAttachment: (objectId: string, attachmentId: string) =>
    request<void>(`/api/travel-objects/${encodeURIComponent(objectId)}/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" }),
  deleteTrip: (id: string) =>
    request<void>(`/api/trips/${encodeURIComponent(id)}`, { method: "DELETE" }),
  resolveMapsUrl: (url: string) =>
    request<{ expandedUrl: string; name: string | null; lat: number | null; lng: number | null; coordinateSource: "url" | "featureId" | null }>("/api/maps/resolve", { method: "POST", body: JSON.stringify({ url }) }),
};
