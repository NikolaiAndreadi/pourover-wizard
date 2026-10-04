export type Pace = "faster" | "steady" | "slower";
/** Seconds off the ideal ramp before the hint leaves "steady". */
const ENTER_SECONDS = 1.5;
/** Seconds back within the ramp before the hint returns to "steady". */
const EXIT_SECONDS = 0.75;
/**
 * Pour pace relative to the ideal ramp, measured in seconds behind or ahead
 * so it scales with each pour's rate. The dead band between the two
 * thresholds keeps the previous hint so it does not flicker.
 */
export function paceHint(
  previous: Pace,
  expectedGrams: number,
  actualGrams: number,
  gramsPerSecond: number,
): Pace {
  if (
    !Number.isFinite(expectedGrams) ||
    !Number.isFinite(actualGrams) ||
    !Number.isFinite(gramsPerSecond) ||
    gramsPerSecond <= 0
  )
    return "steady";
  const behindSeconds = (expectedGrams - actualGrams) / gramsPerSecond;
  if (behindSeconds >= ENTER_SECONDS) return "faster";
  if (behindSeconds <= -ENTER_SECONDS) return "slower";
  if (Math.abs(behindSeconds) <= EXIT_SECONDS) return "steady";
  const sameSide =
    (previous === "faster" && behindSeconds > 0) ||
    (previous === "slower" && behindSeconds < 0);
  return sameSide ? previous : "steady";
}
export const paceLabels: Record<Pace, string> = {
  faster: "↑ Faster",
  steady: "– Keep pace",
  slower: "↓ Slow down",
};
