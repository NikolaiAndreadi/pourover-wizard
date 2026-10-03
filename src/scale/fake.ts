import { expectedWeight, recipe } from "@/core/recipe";
import type { ScaleSample } from "@/core/scale";

/** Seeded synthetic samples follow guidance; independent tests verify target values. */
export function fakeSample(
  atMs: number,
  originMs: number | null,
  waterGrams: number,
  seed: number,
): ScaleSample {
  if (originMs === null) return { atMs, grams: 0 };
  const elapsed = Math.max(0, atMs - originMs);
  const bucket = Math.floor(elapsed / 250);
  let bits = ((bucket + seed) * 1664525 + 1013904223) >>> 0;
  bits ^= bits >>> 16;
  const noise = ((bits % 101) / 100 - 0.5) * 0.3;
  return {
    atMs,
    grams: Math.max(
      0,
      expectedWeight({ ...recipe, waterGrams }, elapsed) + noise,
    ),
  };
}
