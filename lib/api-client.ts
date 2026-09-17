import type { TravelObject, Trip } from "@/types/travel";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Request failed.");
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export const api = {
  trips: () => request<Trip[]>("/api/trips"),
  createTrip: (data: Pick<Trip, "title" | "startDate" | "endDate" | "timezone">) =>
    request<Trip>("/api/trips", { method: "POST", body: JSON.stringify(data) }),
  updateTrip: (id: string, data: Partial<Pick<Trip, "title" | "startDate" | "endDate" | "timezone">>) =>
    request<Trip>(`/api/trips/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  objects: (tripId: string) =>
    request<TravelObject[]>(`/api/travel-objects?tripId=${encodeURIComponent(tripId)}`),
  createObject: (data: Omit<TravelObject, "id" | "createdAt" | "updatedAt">) =>
    request<TravelObject>("/api/travel-objects", { method: "POST", body: JSON.stringify(data) }),
  updateObject: (id: string, data: Partial<TravelObject>) =>
    request<TravelObject>(`/api/travel-objects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteObject: (id: string) =>
    request<void>(`/api/travel-objects/${id}`, { method: "DELETE" }),
  resolveMapsUrl: (url: string) =>
    request<{ expandedUrl: string; name: string | null }>("/api/maps/resolve", { method: "POST", body: JSON.stringify({ url }) }),
};
