import { describe, expect, it } from "vitest";
import { type Pace, paceHint, paceLabels } from "./pace";

describe("pour pace hint", () => {
  // A 50 g pour over 10 s: 5 g/s, so 1.5 s is 7.5 g and 0.75 s is 3.75 g.
  const rate = 5;
  it("flips past one and a half seconds off the ramp in either direction", () => {
    expect(paceHint("steady", 25, 25, rate)).toBe("steady");
    expect(paceHint("steady", 25, 17.6, rate)).toBe("steady");
    expect(paceHint("steady", 25, 17.5, rate)).toBe("faster");
    expect(paceHint("steady", 25, 32.4, rate)).toBe("steady");
    expect(paceHint("steady", 25, 32.5, rate)).toBe("slower");
  });
  it("holds the previous hint inside the dead band and releases within three quarters of a second", () => {
    expect(paceHint("faster", 25, 20, rate)).toBe("faster");
    expect(paceHint("faster", 25, 21.25, rate)).toBe("steady");
    expect(paceHint("slower", 25, 30, rate)).toBe("slower");
    expect(paceHint("slower", 25, 28.75, rate)).toBe("steady");
  });
  it("drops a hint that crossed to the other side of the ramp", () => {
    expect(paceHint("faster", 25, 30, rate)).toBe("steady");
    expect(paceHint("slower", 25, 20, rate)).toBe("steady");
  });
  it("stays steady without a usable rate or reading", () => {
    for (const previous of ["faster", "slower"] as Pace[]) {
      expect(paceHint(previous, 25, 0, 0)).toBe("steady");
      expect(paceHint(previous, 25, 0, -1)).toBe("steady");
      expect(paceHint(previous, 25, Number.NaN, rate)).toBe("steady");
      expect(paceHint(previous, Number.NaN, 0, rate)).toBe("steady");
    }
  });
  it("labels every pace with an arrow or dash first", () => {
    expect(paceLabels.faster).toBe("↑ Faster");
    expect(paceLabels.steady).toBe("– Keep pace");
    expect(paceLabels.slower).toBe("↓ Slow down");
  });
});
