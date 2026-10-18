import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getMyHouseholdId } from "@/lib/household";
import { todayISO } from "@/lib/dates";
import { mediaPath, signMedia, uploadPrivateMedia } from "@/lib/private-media";

export type Trip = Database["public"]["Tables"]["trips"]["Row"];
export type TripStatus = "upcoming" | "active" | "completed";

export function tripStatus(trip: Pick<Trip, "start_date" | "end_date">): TripStatus {
  const today = todayISO();
  if (today < trip.start_date) return "upcoming";
  if (today > trip.end_date) return "completed";
  return "active";
}

export const tripStatusLabel: Record<TripStatus, string> = {
  upcoming: "עתידי",
  active: "פעיל",
  completed: "הושלם",
};

export async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return Promise.all((data ?? []).map(async (t) => ({ ...t, cover_image: await signMedia(t.cover_image, "trip-covers") })));
}

export async function fetchTrip(id: string): Promise<Trip> {
  const { data, error } = await supabase.from("trips").select("*").eq("id", id).single();
  if (error) throw error;
  return { ...data, cover_image: await signMedia(data.cover_image, "trip-covers") };
}

export interface TripInput {
  name: string;
  country: string;
  cities: string | null;
  start_date: string;
  end_date: string;
  budget: number;
  currency: string;
  cover_image: string | null;
}

export async function createTrip(input: TripInput): Promise<string> {
  const household_id = await getMyHouseholdId();
  const { data, error } = await supabase
    .from("trips")
    .insert({ ...input, cover_image: input.cover_image ? mediaPath(input.cover_image, "trip-covers") : null, household_id })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateTrip(id: string, input: TripInput): Promise<void> {
  const { error } = await supabase
    .from("trips")
    .update({ ...input, cover_image: input.cover_image ? mediaPath(input.cover_image, "trip-covers") : null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTrip(id: string): Promise<void> {
  // transactions.trip_id is ON DELETE SET NULL — linked transactions stay,
  // they just stop being tagged to this trip.
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadTripCover(file: File): Promise<string> {
  return uploadPrivateMedia(file, "trip-covers");
}

export interface TripSpending {
  totalIls: number;
  count: number;
}

/** Sum of amount_ils for every transaction tagged to this trip. */
export async function fetchTripSpending(tripId: string): Promise<TripSpending> {
  const { data, error } = await supabase
    .from("transactions")
    .select("amount_ils")
    .eq("trip_id", tripId);
  if (error) throw error;
  const rows = data ?? [];
  return {
    totalIls: rows.reduce((s, r) => s + Number(r.amount_ils), 0),
    count: rows.length,
  };
}

export function tripDurationDays(trip: Pick<Trip, "start_date" | "end_date">): number {
  const start = new Date(trip.start_date + "T00:00:00");
  const end = new Date(trip.end_date + "T00:00:00");
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}
