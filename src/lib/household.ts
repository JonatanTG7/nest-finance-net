import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Household = Database["public"]["Tables"]["households"]["Row"];

export async function fetchMyProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchMyHousehold(): Promise<Household | null> {
  const profile = await fetchMyProfile();
  if (!profile?.household_id) return null;
  const { data, error } = await supabase
    .from("households")
    .select("*")
    .eq("id", profile.household_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Throws when called without a profile/household — RPC paths handle that themselves. */
export async function getMyHouseholdId(): Promise<string> {
  const profile = await fetchMyProfile();
  if (!profile?.household_id) {
    throw new Error("no_household");
  }
  return profile.household_id;
}

export function useMyProfile() {
  return useQuery({ queryKey: ["me", "profile"], queryFn: fetchMyProfile });
}

export function useMyHousehold() {
  return useQuery({ queryKey: ["me", "household"], queryFn: fetchMyHousehold });
}

export function useInvalidateMe() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["me"] });
  };
}

export async function createHousehold(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_household", { _name: name });
  if (error) throw error;
  return data as string;
}

export async function redeemInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc("redeem_invite", { _code: code });
  if (error) throw error;
  return data as string;
}

export async function generateInviteCode(householdId: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_invite_code", {
    _household_id: householdId,
  });
  if (error) throw error;
  return data as string;
}

export async function listMyInvites() {
  const { data, error } = await supabase
    .from("household_invites")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listHouseholdMembers(householdId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, person")
    .eq("household_id", householdId);
  if (error) throw error;
  return data ?? [];
}

export async function updateMyPerson(person: "yonatan" | "shiri") {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("not signed in");
  const { error } = await supabase
    .from("profiles")
    .update({ person })
    .eq("id", auth.user.id);
  if (error) throw error;
}

export async function updateHouseholdName(id: string, name: string) {
  const { error } = await supabase
    .from("households")
    .update({ name })
    .eq("id", id);
  if (error) throw error;
}
