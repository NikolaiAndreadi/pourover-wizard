import { Capacitor } from "@capacitor/core";
import { createNativeTransport } from "./native";
import {
  createWebTransport,
  type ServiceSelection,
  supportsScaleConnection as supportsWebConnection,
} from "./web";

export function supportsScaleConnection(): boolean {
  return Capacitor.getPlatform() === "ios" || supportsWebConnection();
}

export function createScaleTransport(selection?: ServiceSelection) {
  return Capacitor.getPlatform() === "ios"
    ? createNativeTransport(selection)
    : createWebTransport(selection);
}
