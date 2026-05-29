export type Person = "yonatan" | "shiri";

const KEY = "default_person";

export const personLabel: Record<Person, string> = {
  yonatan: "יונתן",
  shiri: "שירי",
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
