import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";

/**
 * Additional household people (children): rows in household_people for
 * people with no app login and no profile. They can own investment
 * accounts — an account's owner is "person:<household_people id>".
 * The owner-id helpers live here (not person.ts) so this module never
 * imports person.ts — person.ts imports fetchHouseholdPeople from here.
 */

/** Prefix for an added person's owner id on investment_accounts.person. */
export const ADDED_PERSON_OWNER_PREFIX = "person:";

/** Owner id of an added person (household_people row). */
export function ownerIdForAddedPerson(id: string): string {
  return `${ADDED_PERSON_OWNER_PREFIX}${id}`;
}

/** The household_people id behind an owner id, or null for slot owners. */
export function addedPersonIdOf(owner: string | null | undefined): string | null {
  if (!owner || !owner.startsWith(ADDED_PERSON_OWNER_PREFIX)) return null;
  const id = owner.slice(ADDED_PERSON_OWNER_PREFIX.length);
  return id === "" ? null : id;
}

/** Is this owner an added person (not a login member, not shared)? */
export function isAddedPersonOwner(owner: string | null | undefined): boolean {
  return addedPersonIdOf(owner) != null;
}

export interface HouseholdPersonRow {
  id: string;
  household_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export async function fetchHouseholdPeople(householdId?: string): Promise<HouseholdPersonRow[]> {
  const id = householdId ?? (await getMyHouseholdId());
  const { data, error } = await supabase
    .from("household_people")
    .select("*")
    .eq("household_id", id)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export function useHouseholdPeople() {
  return useQuery({ queryKey: ["household_people"], queryFn: () => fetchHouseholdPeople() });
}

export function useInvalidateHouseholdPeople() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["household_people"] });
    qc.invalidateQueries({ queryKey: ["me", "householdPersons"] });
    qc.invalidateQueries({ queryKey: ["me", "memberLabels"] });
  };
}

/** Adds a person; they go last in the list. */
export async function addHouseholdPerson(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("צריך שם לאדם");
  const household_id = await getMyHouseholdId();
  const { data: last } = await supabase
    .from("household_people")
    .select("sort_order")
    .eq("household_id", household_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("household_people")
    .insert({ household_id, name: trimmed, sort_order: (last?.sort_order ?? -1) + 1 })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function renameHouseholdPerson(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("צריך שם לאדם");
  const { error } = await supabase.from("household_people").update({ name: trimmed }).eq("id", id);
  if (error) throw error;
}

/**
 * Removes a person. Blocked while they own any account — the accounts
 * must be moved to another owner first, so no account is ever orphaned.
 * The UI pre-checks the same condition; this re-checks at delete time
 * in case two phones race.
 */
export async function deleteHouseholdPerson(id: string): Promise<void> {
  const { count, error } = await supabase
    .from("investment_accounts")
    .select("id", { count: "exact", head: true })
    .eq("person", ownerIdForAddedPerson(id));
  if (error) throw error;
  if ((count ?? 0) > 0) {
    throw new Error("לא ניתן למחוק — לאדם הזה עדיין יש חשבונות. העבירו אותם לבעלים אחר קודם.");
  }
  const { error: delErr } = await supabase.from("household_people").delete().eq("id", id);
  if (delErr) throw delErr;
}
