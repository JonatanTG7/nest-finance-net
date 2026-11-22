import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile } from "@/lib/household";

export type Person = "yonatan" | "shiri" | "shared";

const KEY = "default_person";

/** Static fallback labels (used before household members load). */
export const personLabel: Record<Person, string> = {
  yonatan: "חבר א׳",
  shiri: "חבר ב׳",
  shared: "Shared",
};

export function getDefaultPerson(): Person {
  if (typeof window === "undefined") return "yonatan";
  const v = window.localStorage.getItem(KEY);
  if (v === "shiri" || v === "shared" || v === "yonatan") return v;
  return "yonatan";
}

export function setDefaultPerson(p: Person) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, p);
  }
}

/**
 * Returns labels for the person slots, based on household members' display names.
 * "shared" always shows the English word "Shared" (per user requirement).
 */
/** Returns the first word of a display name ("Jonatan Cohen" → "Jonatan"). */
function firstName(s: string): string {
  return s.trim().split(/\s+/)[0] ?? s;
}

export function useMemberLabels(): Record<Person, string> {
  const { data } = useQuery({
    queryKey: ["me", "memberLabels"],
    queryFn: async (): Promise<Record<Person, string>> => {
      const me = await fetchMyProfile();
      const out: Record<Person, string> = { ...personLabel };
      if (!me?.household_id) return out;
      const { data: members } = await supabase
        .from("profiles")
        .select("person, display_name")
        .eq("household_id", me.household_id);
      for (const m of members ?? []) {
        if (m.person && m.display_name && (m.person === "yonatan" || m.person === "shiri")) {
          out[m.person as Person] = firstName(m.display_name);
        }
      }
      return out;
    },
  });
  return data ?? personLabel;
}

/** One household member who holds a person slot — never "shared". */
export interface HouseholdPerson {
  person: Person;
  /** First name from the member's display name, or the generic fallback. */
  label: string;
  avatarUrl: string | null;
}

/** The two person slots, in stable order (first member first). */
const PERSON_SLOTS: Person[] = ["yonatan", "shiri"];

/**
 * Accent colors for person entries, by position in the household list —
 * the first member gets the first color, the second the second. Colors
 * follow list position, never a specific person.
 */
export const PERSON_ACCENT_COLORS = ["#8b5cf6", "#0891b2"];

export function personAccentColor(index: number): string {
  return PERSON_ACCENT_COLORS[index % PERSON_ACCENT_COLORS.length];
}

/**
 * The household's members, derived from the profiles table — the two
 * people who opened the joint account. This is the single place that
 * turns person slots into people; callers never hardcode member names.
 * A member without a slot (or a household with one member so far) simply
 * doesn't appear.
 */
export function useHouseholdPersons(): { persons: HouseholdPerson[]; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["me", "householdPersons"],
    queryFn: async (): Promise<HouseholdPerson[]> => {
      const me = await fetchMyProfile();
      if (!me?.household_id) return [];
      const { data: members } = await supabase
        .from("profiles")
        .select("person, display_name, avatar_url")
        .eq("household_id", me.household_id);
      const bySlot = new Map<Person, HouseholdPerson>();
      for (const m of members ?? []) {
        const slot = m.person as Person | null;
        if (!slot || !PERSON_SLOTS.includes(slot) || bySlot.has(slot)) continue;
        bySlot.set(slot, {
          person: slot,
          label: m.display_name ? firstName(m.display_name) : personLabel[slot],
          avatarUrl: m.avatar_url ?? null,
        });
      }
      return PERSON_SLOTS.flatMap((slot) => {
        const p = bySlot.get(slot);
        return p ? [p] : [];
      });
    },
  });
  return { persons: data ?? [], isLoading };
}
