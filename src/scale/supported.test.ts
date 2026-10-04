import { describe, expect, it } from "vitest";
import { bookooUuids } from "@/scale/bookoo/codec";
import {
  canonicalUuid,
  identify,
  modelName,
  namePrefixes,
  optionalServices,
  requestFilters,
  supportedScales,
} from "./supported";

describe("supported scale registry", () => {
  it("records the verified Themis Mini first and keeps documented models untested", () => {
    const [mini, ...others] = supportedScales;
    expect(mini).toMatchObject({
      id: "bookoo-themis-mini",
      namePrefixes: ["BOOKOO_SC"],
      service: bookooUuids.service,
      notify: bookooUuids.notify,
      command: bookooUuids.command,
      protocol: "bookoo-mini",
      verified: true,
    });
    expect(others.length).toBeGreaterThan(0);
    for (const model of others) {
      expect(model.verified).toBe(false);
      expect(model.note).toMatch(/protocols\.md/);
    }
    expect(new Set(supportedScales.map((model) => model.id)).size).toBe(
      supportedScales.length,
    );
    for (const model of supportedScales) {
      expect(model.brand).not.toBe("");
      expect(model.model).not.toBe("");
      expect(model.note).not.toBe("");
      for (const uuid of [model.service, model.notify, model.command])
        expect(uuid).toBe(canonicalUuid(uuid));
    }
    expect(modelName(mini!)).toBe("BOOKOO Themis Mini");
  });
  it("derives deduplicated chooser filters and service access from the registry", () => {
    expect(namePrefixes()).toEqual(["BOOKOO_SC"]);
    expect(optionalServices()).toEqual([bookooUuids.service]);
    expect(requestFilters()).toEqual([
      { services: [bookooUuids.service] },
      { namePrefix: "BOOKOO_SC" },
    ]);
  });
});
describe("UUID normalization", () => {
  it.each([
    ["0FFE", "00000ffe-0000-1000-8000-00805f9b34fb"],
    ["0x0ffe", "00000ffe-0000-1000-8000-00805f9b34fb"],
    ["00000FFE", "00000ffe-0000-1000-8000-00805f9b34fb"],
    [" 00000FFE-0000-1000-8000-00805F9B34FB ", bookooUuids.service],
    ["custom-uuid", "custom-uuid"],
  ])("expands %j to %j", (short, long) => {
    expect(canonicalUuid(short)).toBe(long);
  });
});
describe("identify", () => {
  it("matches the service in short, 32-bit and long forms", () => {
    for (const form of ["0ffe", "0FFE", "00000ffe", bookooUuids.service])
      expect(identify(["180a", form])?.id).toBe("bookoo-themis-mini");
  });
  it("returns null without a supported service", () => {
    expect(identify([])).toBeNull();
    expect(identify(["180a", "0fff"])).toBeNull();
    expect(identify(["0fff"], "BOOKOO_SC 000000")).toBeNull();
  });
  it("prefers the model whose name prefix matches when models share a service", () => {
    expect(identify([bookooUuids.service], "BOOKOO_SC 1234")?.id).toBe(
      "bookoo-themis-mini",
    );
    expect(identify([bookooUuids.service], "Other name")?.id).toBe(
      "bookoo-themis-mini",
    );
    expect(identify([bookooUuids.service])?.id).toBe("bookoo-themis-mini");
  });
});
