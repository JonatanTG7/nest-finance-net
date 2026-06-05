import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile } from "@/lib/household";

export type Person = "yonatan" | "shiri";

const KEY = "default_person";

/** Static fallback labels (used before household members load). */
export const personLabel: Record<Person, string> = {
  yonatan: "חבר א׳",
  shiri: "חבר ב׳",
};

export function getDefaultPerson(): Person {
  if (typeof window === "undefined") return "yonatan";
  const v = window.localStorage.getItem(KEY);
  return v === "shiri" ? "shiri" : "yonatan";
}

export function setDefaultPerson(p: Person) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, p);
  }
}

/**
 * Returns labels for the two "person" slots, based on the actual household
 * members' display names. Falls back to generic labels.
 */
export function useMemberLabels(): Record<Person, string> {
  const { data } = useQuery({
    queryKey: ["me", "memberLabels"],
    queryFn: async (): Promise<Record<Person, string>> => {
      const me = await fetchMyProfile();
      if (!me?.household_id) return { ...personLabel };
      const { data: members } = await supabase
        .from("profiles")
        .select("person, display_name")
        .eq("household_id", me.household_id);
      const out: Record<Person, string> = { ...personLabel };
      for (const m of members ?? []) {
        if (m.person && m.display_name) {
          out[m.person as Person] = m.display_name;
        }
      }
      return out;
    },
  });
  return data ?? personLabel;
}
