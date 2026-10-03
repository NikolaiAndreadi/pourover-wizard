import { Capacitor } from "@capacitor/core";
import { afterEach, expect, it, vi } from "vitest";
import { createScaleTransport, supportsScaleConnection } from "./index";

vi.mock("./native", () => ({ createNativeTransport: vi.fn(() => "native") }));
vi.mock("./web", () => ({
  createWebTransport: vi.fn(() => "web"),
  supportsScaleConnection: () => false,
}));
afterEach(() => vi.restoreAllMocks());
it("selects native BLE only in the iOS shell", () => {
  vi.spyOn(Capacitor, "getPlatform").mockReturnValue("ios");
  expect(supportsScaleConnection()).toBe(true);
  expect(createScaleTransport()).toBe("native");
});
it("preserves browser capability checks and browser transport", () => {
  vi.spyOn(Capacitor, "getPlatform").mockReturnValue("web");
  expect(supportsScaleConnection()).toBe(false);
  expect(createScaleTransport()).toBe("web");
});
