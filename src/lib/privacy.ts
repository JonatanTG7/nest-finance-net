import { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------ *
 * Privacy mode (investments area only): replace money amounts with
 * asterisks so a glance over the shoulder reveals nothing. The digits
 * are not rendered at all — not even blurred — so nothing about a
 * value leaks, not even its magnitude. This is anti-glance
 * protection, not security: the values stay in the app state, and
 * revealing them is one tap on the eye button.
 *
 * Default is HIDDEN: on a fresh device the amounts start masked and
 * the user reveals them with the eye button. The choice is stored per
 * device in localStorage, like the other personal settings.
 * ------------------------------------------------------------------ */

// NOTE: the key name says "blurred" — the original masking style.
// Kept as-is so devices that already stored a choice keep it.
const PRIVACY_KEY = "investments_privacy_blurred";
const PRIVACY_EVENT = "investments-privacy-change";

/** Fixed mask shown in place of a hidden amount — no digits, no magnitude. */
export const PRIVACY_MASK = "****";

/**
 * Pure parse of the stored value. Missing or anything other than "0"
 * means hidden — the default is private.
 */
export function parsePrivacyStored(raw: string | null): boolean {
  return raw !== "0";
}

export function getPrivacyHidden(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return parsePrivacyStored(window.localStorage.getItem(PRIVACY_KEY));
  } catch {
    return true;
  }
}

export function setPrivacyHidden(hidden: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRIVACY_KEY, hidden ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(PRIVACY_EVENT));
}

/**
 * Mask the numbers in a formatted amount: every run of digits (with
 * grouping commas / decimals) becomes the fixed `****` mask. Currency
 * symbols, % signs and +/- signs stay visible (e.g. "₪ 124,075" →
 * "₪ ****", "$38,306.66" → "$****", "3.25%" → "****%"). Strings
 * without digits (e.g. "—" for a missing price) pass through unchanged.
 */
export function maskAmountText(text: string, hidden: boolean): string {
  if (!hidden) return text;
  return text.replace(/[\d.,]+/g, PRIVACY_MASK);
}

/**
 * Reactive privacy state, shared by the investments index, the IB
 * screen and the single-account page so they never disagree. Safe for
 * SSR: starts hidden (the default) and reads the stored choice after
 * mount.
 */
export function usePrivacyMode() {
  const [hidden, setHiddenState] = useState<boolean>(true);

  useEffect(() => {
    const read = () => setHiddenState(getPrivacyHidden());
    read();
    window.addEventListener(PRIVACY_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(PRIVACY_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const setHidden = useCallback((value: boolean) => {
    setPrivacyHidden(value);
  }, []);

  const toggle = useCallback(() => {
    setPrivacyHidden(!getPrivacyHidden());
  }, []);

  return { hidden, setHidden, toggle };
}
