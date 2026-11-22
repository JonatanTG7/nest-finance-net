import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { fetchMyProfile, getMyHouseholdId } from "@/lib/household";

export type EmailDigestPreference = Database["public"]["Tables"]["email_digest_preferences"]["Row"];

export interface EmailDigestInput {
  email: string;
  enabled: boolean;
  weekly_enabled: boolean;
  weekly_weekday: number | null;
  monthly_enabled: boolean;
  monthly_day: number | null;
}

export const WEEKDAY_LABELS_HE = [
  "יום ראשון",
  "יום שני",
  "יום שלישי",
  "יום רביעי",
  "יום חמישי",
  "יום שישי",
  "יום שבת",
];

/** The signed-in member's digest preferences, or null when never set. */
export async function fetchMyEmailDigestPreference(): Promise<EmailDigestPreference | null> {
  const profile = await fetchMyProfile();
  if (!profile) return null;
  const { data, error } = await supabase
    .from("email_digest_preferences")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function useEmailDigestPreference() {
  return useQuery({
    queryKey: ["email-digest", "mine"],
    queryFn: fetchMyEmailDigestPreference,
  });
}

export function useInvalidateEmailDigestPreference() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["email-digest", "mine"] });
  };
}

function validateInput(input: EmailDigestInput): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    throw new Error("כתובת המייל לא תקינה");
  }
  if (
    input.weekly_enabled &&
    (input.weekly_weekday == null || input.weekly_weekday < 0 || input.weekly_weekday > 6)
  ) {
    throw new Error("יש לבחור יום בשבוע לסיכום השבועי");
  }
  if (
    input.monthly_enabled &&
    (input.monthly_day == null || input.monthly_day < 1 || input.monthly_day > 31)
  ) {
    throw new Error("יום בחודש חייב להיות בין 1 ל-31");
  }
}

/** Creates or updates my own row (one row per member). */
export async function saveEmailDigestPreference(input: EmailDigestInput): Promise<void> {
  validateInput(input);
  const profile = await fetchMyProfile();
  if (!profile?.household_id) throw new Error("no_household");
  const household_id = await getMyHouseholdId();
  const row = {
    household_id,
    profile_id: profile.id,
    email: input.email.trim(),
    enabled: input.enabled,
    weekly_enabled: input.weekly_enabled,
    weekly_weekday: input.weekly_enabled ? input.weekly_weekday : null,
    monthly_enabled: input.monthly_enabled,
    monthly_day: input.monthly_enabled ? input.monthly_day : null,
  };
  const { error } = await supabase
    .from("email_digest_preferences")
    .upsert(row, { onConflict: "profile_id" });
  if (error) throw error;
}

/** The signed-in user's login email, used to prefill the form. */
export async function fetchMyAuthEmail(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  return auth.user?.email ?? null;
}
