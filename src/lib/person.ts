import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar";
import { fetchMyProfile } from "@/lib/household";
import {
  addedPersonIdOf,
  fetchHouseholdPeople,
  isAddedPersonOwner,
  ownerIdForAddedPerson,
  type HouseholdPersonRow,
} from "@/lib/household-people";

// Owner-id helpers live in household-people.ts (single source of truth
// for the "person:<id>" encoding); re-exported here for convenience.
export { addedPersonIdOf, isAddedPersonOwner, ownerIdForAddedPerson };

/**
 * The DB `person` enum ("yonatan" | "shiri" | "shared") — the two login
 * members' slots plus the shared pseudo-person. This type still governs
 * the enum columns: transactions/subscriptions entered_by, history
 * changed_by, and the "who am I" default person. Those are always real
 * users, so the enum is the right fit there.
 */
export type Person = "yonatan" | "shiri" | "shared";

/**
 * Who owns an investment account. investment_accounts.person is plain
 * text (migration 20261123180000): the three slot values above, or
 * "person:<household_people id>" for an added person (a child with no
 * app login). A separate type from Person on purpose — widening Person
 * to string would break the typed inserts into the enum columns.
 */
export type OwnerId = string;

/** The shared owner — an account owned by the household, not one person. */
export const SHARED_OWNER: OwnerId = "shared";

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
 * Display names for every owner id: the two login members (first name
 * from their display name), the added people (their name as entered),
 * and "Shared" for the shared owner. Keyed by owner id so history rows
 * and account cards can look any owner up — including added people.
 * "shared" always shows the English word "Shared" (per user requirement).
 */
/** Returns the first word of a display name ("Jonatan Cohen" → "Jonatan"). */
function firstName(s: string): string {
  return s.trim().split(/\s+/)[0] ?? s;
}

export function useMemberLabels(): Record<string, string> {
  const { data } = useQuery({
    queryKey: ["me", "memberLabels"],
    queryFn: async (): Promise<Record<string, string>> => {
      const me = await fetchMyProfile();
      const out: Record<string, string> = { ...personLabel };
      if (!me?.household_id) return out;
      const [members, added] = await Promise.all([
        supabase
          .from("profiles")
          .select("person, display_name")
          .eq("household_id", me.household_id),
        fetchHouseholdPeople(me.household_id),
      ]);
      for (const m of members.data ?? []) {
        if (m.person && m.display_name && (m.person === "yonatan" || m.person === "shiri")) {
          out[m.person as Person] = firstName(m.display_name);
        }
      }
      for (const p of added) {
        out[ownerIdForAddedPerson(p.id)] = p.name;
      }
      return out;
    },
  });
  return data ?? personLabel;
}

/**
 * Owner display label — never a dash: an unknown or not-yet-loaded owner
 * id falls back to the shared label, which the map always carries.
 */
export function resolveOwnerLabel(
  labels: Record<string, string>,
  owner: OwnerId | null | undefined,
): string {
  return labels[owner ?? SHARED_OWNER] ?? labels[SHARED_OWNER] ?? "Shared";
}

/**
 * Static English names for the data export: the two login slots always
 * show their English first names — never the raw DB enum value ("yonatan"
 * is the internal key, "Jonatan" is the person's name), and never the
 * Hebrew fallback labels. Added people are looked up from the
 * household-people records the export already loads.
 */
export const exportPersonLabel: Record<Person, string> = {
  yonatan: "Jonatan",
  shiri: "Shiri",
  shared: "Shared",
};

/** Full export label map: static English slot names + added people's names. */
export function buildExportPersonLabels(
  added: Pick<HouseholdPersonRow, "id" | "name">[],
): Record<string, string> {
  const out: Record<string, string> = { ...exportPersonLabel };
  for (const p of added) out[ownerIdForAddedPerson(p.id)] = p.name;
  return out;
}

/**
 * Export display name for an owner id — a raw enum value or id never
 * lands in a CSV: unknown or null ids fall back to "Shared", same as
 * resolveOwnerLabel.
 */
export function resolveExportPersonLabel(
  labels: Record<string, string>,
  owner: OwnerId | null | undefined,
): string {
  return labels[owner ?? SHARED_OWNER] ?? labels[SHARED_OWNER] ?? "Shared";
}

/** One person who can own accounts — never "shared". */
export interface HouseholdPerson {
  person: OwnerId;
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
export const PERSON_ACCENT_COLORS = ["#8b5cf6", "#0891b2", "#10b981", "#f59e0b", "#ec4899"];

export function personAccentColor(index: number): string {
  return PERSON_ACCENT_COLORS[index % PERSON_ACCENT_COLORS.length];
}

/**
 * Browser-tab title for a person page: the person's name when known,
 * the generic label otherwise. The static route `head` can't see the
 * loaded label, so the page sets the title itself once the person
 * loads. (Try-it item, 2026-11-25: Jonatan checks it live and may veto.)
 */
export function resolvePersonPageTitle(label: string | null | undefined): string {
  const trimmed = label?.trim();
  return trimmed ? trimmed : "חשבונות פרטיים";
}

/**
 * Merges the login members (profile slots) with the added people into
 * one stable list: slots first, in slot order, then added people by
 * their sort order. Pure, so the merge rule is testable without a DB.
 */
export function mergeHouseholdPersons(
  slotPersons: HouseholdPerson[],
  added: HouseholdPersonRow[],
): HouseholdPerson[] {
  const bySlot = new Map(slotPersons.map((p) => [p.person, p]));
  const slots = PERSON_SLOTS.flatMap((slot) => {
    const p = bySlot.get(slot);
    return p ? [p] : [];
  });
  const addedPeople: HouseholdPerson[] = [...added]
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((p) => ({
      person: ownerIdForAddedPerson(p.id),
      label: p.name,
      avatarUrl: null,
    }));
  return [...slots, ...addedPeople];
}

/**
 * The household's people, derived from the profiles table (the two
 * people who opened the joint account) plus household_people (added
 * people with no login, e.g. children). This is the single place that
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
      const [membersRes, added] = await Promise.all([
        supabase
          .from("profiles")
          .select("person, display_name, avatar_url")
          .eq("household_id", me.household_id),
        fetchHouseholdPeople(me.household_id),
      ]);
      const bySlot = new Map<Person, HouseholdPerson>();
      for (const m of membersRes.data ?? []) {
        const slot = m.person as Person | null;
        if (!slot || !PERSON_SLOTS.includes(slot) || bySlot.has(slot)) continue;
        // Stored avatars are either an auth-provider URL (used as-is) or a
        // private-bucket path (signed here). A failed sign never fails the
        // whole list — the member just shows their initial.
        let avatarUrl: string | null = null;
        try {
          avatarUrl = await resolveAvatarUrl(m.avatar_url);
        } catch {
          avatarUrl = null;
        }
        bySlot.set(slot, {
          person: slot,
          label: m.display_name ? firstName(m.display_name) : personLabel[slot],
          avatarUrl,
        });
      }
      return mergeHouseholdPersons([...bySlot.values()], added);
    },
  });
  return { persons: data ?? [], isLoading };
}
