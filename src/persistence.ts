// Storage durability helpers.
//
// On iOS Safari and a few other browsers, localStorage gets evicted after
// ~7 days of inactivity (Apple's Intelligent Tracking Prevention). The two
// reliable ways to keep our data are:
//   1. Call `navigator.storage.persist()` — asks the browser to mark our
//      origin's storage as "persistent" so it survives ITP cleanup.
//   2. Have the user "Add to Home Screen" (install as a PWA). Installed
//      PWAs are exempt from the 7-day cap on iOS.
//
// We do (1) automatically, and we surface a small, dismissible hint about
// (2) when we detect we're running in a browser tab rather than standalone.

const DISMISS_KEY = "bandydos.installHint.dismissed";

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage) return false;
  try {
    if (typeof navigator.storage.persisted === "function") {
      const already = await navigator.storage.persisted();
      if (already) return true;
    }
    if (typeof navigator.storage.persist === "function") {
      return await navigator.storage.persist();
    }
  } catch {
    /* swallow — we treat persistence as best-effort */
  }
  return false;
}

interface IOSNavigator extends Navigator {
  standalone?: boolean;
}

/** True when the app is running as an installed PWA (home-screen / standalone). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (window.navigator as IOSNavigator).standalone === true;
}

/** Rough OS detection so we can tailor "Add to Home Screen" instructions. */
export function detectPlatform(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function loadInstallHintDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveInstallHintDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* noop */
  }
}
