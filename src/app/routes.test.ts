import { describe, expect, it } from "vitest";
import { routeFromHash } from "./routes";

describe("hash routes", () => {
  it("opens the about screen directly", () =>
    expect(routeFromHash("#/about")).toBe("about"));
  it.each(["", "#/", "#/missing", "#/about/extra"])(
    "returns home for %s",
    (hash) => expect(routeFromHash(hash)).toBe("home"),
  );
});
