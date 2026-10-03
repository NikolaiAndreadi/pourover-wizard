import { Capacitor } from "@capacitor/core";
import type { RememberedDevice } from "@/scale/contracts";
import { createNativeTransport } from "./native";
import {
  createWebTransport,
  supportsScaleConnection as supportsWebConnection,
} from "./web";

export function supportsScaleConnection(): boolean {
  return Capacitor.getPlatform() === "ios" || supportsWebConnection();
}

/** The remembered scale lets a later connection skip the chooser. */
export function createScaleTransport(remembered?: RememberedDevice) {
  return Capacitor.getPlatform() === "ios"
    ? createNativeTransport(undefined, remembered)
    : createWebTransport(undefined, remembered);
}
