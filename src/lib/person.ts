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
          out[m.person as Person] = m.display_name;
        }
      }
      return out;
    },
  });
  return data ?? personLabel;
}
