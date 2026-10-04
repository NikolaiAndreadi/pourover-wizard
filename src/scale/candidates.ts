import type { ScanCandidate } from "@/scale/contracts";

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});
/**
 * Strongest signal first (missing RSSI last), then name alphanumerically and
 * case-insensitively (nameless last), then device id. Pure and stable.
 */
export function sortCandidates(
  list: readonly ScanCandidate[],
): ScanCandidate[] {
  return [...list].sort((a, b) => {
    const signal =
      (b.rssi ?? Number.NEGATIVE_INFINITY) -
      (a.rssi ?? Number.NEGATIVE_INFINITY);
    if (signal !== 0 && !Number.isNaN(signal)) return signal;
    if (a.name === undefined || b.name === undefined) {
      if (a.name !== b.name) return a.name === undefined ? 1 : -1;
    } else {
      const byName = collator.compare(a.name, b.name);
      if (byName !== 0) return byName;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
