import { Capacitor } from "@capacitor/core";
import { createNativeTransport } from "./native";
import {
  createWebTransport,
  supportsScaleConnection as supportsWebConnection,
} from "./web";

export function supportsScaleConnection(): boolean {
  return Capacitor.getPlatform() === "ios" || supportsWebConnection();
}

export function createScaleTransport() {
  return Capacitor.getPlatform() === "ios"
    ? createNativeTransport()
    : createWebTransport();
}
