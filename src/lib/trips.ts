import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getMyHouseholdId } from "@/lib/household";

export type Trip = Database["public"]["Tables"]["trips"]["Row"];
export type TripStatus = "upcoming" | "active" | "completed";

export function tripStatus(trip: Pick<Trip, "start_date" | "end_date">): TripStatus {
  const today = new Date().toISOString().slice(0, 10);
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
  return data ?? [];
}

export async function fetchTrip(id: string): Promise<Trip> {
  const { data, error } = await supabase.from("trips").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
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
    .insert({ ...input, household_id })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateTrip(id: string, input: TripInput): Promise<void> {
  const { error } = await supabase
    .from("trips")
    .update({ ...input, updated_at: new Date().toISOString() })
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
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("trip-covers")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = await supabase.storage
    .from("trip-covers")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  return data?.signedUrl ?? path;
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
