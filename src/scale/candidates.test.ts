import { describe, expect, it } from "vitest";
import { sortCandidates } from "./candidates";

describe("sortCandidates", () => {
  it("orders by strongest signal, then case-insensitive alphanumeric name, then id", () => {
    const sorted = sortCandidates([
      { id: "d", name: "scale 10", rssi: -70 },
      { id: "c", name: "Scale 9", rssi: -70 },
      { id: "b", name: "Zed", rssi: -40 },
      { id: "a", name: "alpha", rssi: -70 },
      { id: "f", name: "same", rssi: -70 },
      { id: "e", name: "Same", rssi: -70 },
    ]);
    expect(sorted.map((candidate) => candidate.id)).toEqual([
      "b",
      "a",
      "e",
      "f",
      "c",
      "d",
    ]);
  });
  it("puts nameless devices after named ones at equal signal, then missing signal last", () => {
    const sorted = sortCandidates([
      { id: "z", rssi: -50 },
      { id: "y", name: "Named", rssi: -50 },
      { id: "x", rssi: -50 },
      { id: "w", name: "Strong but unknown" },
      { id: "v", rssi: -90 },
      { id: "u" },
    ]);
    expect(sorted.map((candidate) => candidate.id)).toEqual([
      "y",
      "x",
      "z",
      "v",
      "w",
      "u",
    ]);
  });
  it("does not mutate its input and is stable for identical entries", () => {
    const input = [
      { id: "b", name: "A", rssi: -60 },
      { id: "a", name: "A", rssi: -60 },
    ];
    const copy = structuredClone(input);
    expect(sortCandidates(input).map((candidate) => candidate.id)).toEqual([
      "a",
      "b",
    ]);
    expect(input).toEqual(copy);
    expect(sortCandidates([])).toEqual([]);
  });
});
