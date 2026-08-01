import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getMyHouseholdId } from "@/lib/household";

export type Trip = Database["public"]["Tables"]["trips"]["Row"];

export type TripStatus = "upcoming" | "active" | "completed";

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

export const tripStatusLabel: Record<TripStatus, string> = {
  upcoming: "לפני הטיסה",
  active: "בטיול",
  completed: "הסתיים",
};

export const tripStatusClass: Record<TripStatus, string> = {
  upcoming: "bg-white/20 text-white",
  active: "bg-emerald-500/90 text-white",
  completed: "bg-black/40 text-white/90",
};

/** Status is always derived from the dates — never stored. */
export function tripStatus(trip: Pick<Trip, "start_date" | "end_date">): TripStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (today < trip.start_date) return "upcoming";
  if (today > trip.end_date) return "completed";
  return "active";
}

/** Inclusive number of days between start and end. */
export function tripDays(trip: Pick<Trip, "start_date" | "end_date">): number {
  const a = new Date(trip.start_date + "T00:00:00");
  const b = new Date(trip.end_date + "T00:00:00");
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return Math.max(1, diff);
}

export function formatTripRange(trip: Pick<Trip, "start_date" | "end_date">): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" }).format(
      new Date(iso + "T00:00:00"),
    );
  const year = new Date(trip.end_date + "T00:00:00").getFullYear();
  return `${fmt(trip.start_date)} – ${fmt(trip.end_date)} ${year}`;
}

const FLAGS: Record<string, string> = {
  יפן: "🇯🇵", japan: "🇯🇵",
  איטליה: "🇮🇹", italy: "🇮🇹",
  גרמניה: "🇩🇪", germany: "🇩🇪",
  צרפת: "🇫🇷", france: "🇫🇷",
  ספרד: "🇪🇸", spain: "🇪🇸",
  יוון: "🇬🇷", greece: "🇬🇷",
  תאילנד: "🇹🇭", thailand: "🇹🇭",
  "ארהב": "🇺🇸", "ארה״ב": "🇺🇸", usa: "🇺🇸", "united states": "🇺🇸",
  אנגליה: "🇬🇧", בריטניה: "🇬🇧", uk: "🇬🇧",
  הולנד: "🇳🇱", netherlands: "🇳🇱",
  פורטוגל: "🇵🇹", portugal: "🇵🇹",
  שווייץ: "🇨🇭", switzerland: "🇨🇭",
  אוסטריה: "🇦🇹", austria: "🇦🇹",
  "צ׳כיה": "🇨🇿", "צכיה": "🇨🇿", czechia: "🇨🇿",
  ישראל: "🇮🇱", israel: "🇮🇱",
  קפריסין: "🇨🇾", cyprus: "🇨🇾",
  טורקיה: "🇹🇷", turkey: "🇹🇷",
  ויאטנם: "🇻🇳", vietnam: "🇻🇳",
  סרילנקה: "🇱🇰",
  הודו: "🇮🇳", india: "🇮🇳",
  קנדה: "🇨🇦", canada: "🇨🇦",
  ברזיל: "🇧🇷", brazil: "🇧🇷",
  ארגנטינה: "🇦🇷", argentina: "🇦🇷",
  אוסטרליה: "🇦🇺", australia: "🇦🇺",
  מרוקו: "🇲🇦", morocco: "🇲🇦",
  גאורגיה: "🇬🇪", georgia: "🇬🇪",
  דובאי: "🇦🇪", "איחוד האמירויות": "🇦🇪", uae: "🇦🇪",
};

export function countryFlag(country: string | null | undefined): string {
  if (!country) return "🌍";
  const key = country.trim().toLowerCase();
  return FLAGS[key] ?? FLAGS[country.trim()] ?? "🌍";
}

/** Deterministic fallback gradient when a trip has no cover image. */
export function tripGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 55) % 360;
  return `linear-gradient(135deg, hsl(${a} 65% 42%) 0%, hsl(${b} 70% 28%) 100%)`;
}

// ============================ data access ============================

export async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchTrip(id: string): Promise<Trip | null> {
  const { data, error } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
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
  const { error } = await supabase.from("trips").update(input).eq("id", id);
  if (error) throw error;
}

/** Linked transactions keep existing (trip_id is set to null by the DB). */
export async function deleteTrip(id: string): Promise<void> {
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadTripCover(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `trips/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("transaction-photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = await supabase.storage
    .from("transaction-photos")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  return data?.signedUrl ?? path;
}

export function useTrips() {
  return useQuery({ queryKey: ["trips"], queryFn: fetchTrips });
}

export function useInvalidateTrips() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["trips"] });
    qc.invalidateQueries({ queryKey: ["trip"] });
  };
}
