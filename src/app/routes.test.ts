import { describe, expect, it } from "vitest";
import { routeFromHash } from "@/app/routes";

describe("hash routes", () => {
  it("opens the about screen directly", () =>
    expect(routeFromHash("#/about")).toBe("about"));
  it("opens scale lab directly", () =>
    expect(routeFromHash("#/scale-lab")).toBe("scale-lab"));
  it.each(["", "#/", "#/missing", "#/about/extra"])(
    "returns home for %s",
    (hash) => expect(routeFromHash(hash)).toBe("home"),
  );
});
