import { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------ *
 * Privacy mode (investments area only): blur all money amounts so a
 * glance over the shoulder reveals nothing. This is anti-glance
 * protection, not security — the values stay in the DOM.
 *
 * Default is BLURRED: on a fresh device the amounts start hidden and
 * the user reveals them with the eye button. The choice is stored per
 * device in localStorage, like the other personal settings.
 * ------------------------------------------------------------------ */

const PRIVACY_KEY = "investments_privacy_blurred";
const PRIVACY_EVENT = "investments-privacy-change";

/**
 * Pure parse of the stored value. Missing or anything other than "0"
 * means blurred — the default is private.
 */
export function parsePrivacyStored(raw: string | null): boolean {
  return raw !== "0";
}

export function getPrivacyBlurred(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return parsePrivacyStored(window.localStorage.getItem(PRIVACY_KEY));
  } catch {
    return true;
  }
}

export function setPrivacyBlurred(blurred: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRIVACY_KEY, blurred ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(PRIVACY_EVENT));
}

/** Tailwind classes that hide an amount while keeping its layout. */
export function privacyBlurClass(blurred: boolean): string {
  return blurred ? "blur-md select-none" : "";
}

/**
 * Reactive privacy state, shared by the investments index, the IB
 * screen and the single-account page so they never disagree. Safe for
 * SSR: starts blurred (the default) and reads the stored choice after
 * mount.
 */
export function usePrivacyMode() {
  const [blurred, setBlurredState] = useState<boolean>(true);

  useEffect(() => {
    const read = () => setBlurredState(getPrivacyBlurred());
    read();
    window.addEventListener(PRIVACY_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(PRIVACY_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const setBlurred = useCallback((value: boolean) => {
    setPrivacyBlurred(value);
  }, []);

  const toggle = useCallback(() => {
    setPrivacyBlurred(!getPrivacyBlurred());
  }, []);

  return { blurred, setBlurred, toggle };
}
