import type { ScaleModel } from "@/scale/supported";

/** Connection progress reported before the scale link is ready. */
export type ConnectStep =
  | { kind: "chooser" }
  | { kind: "device"; name: string | undefined };
export interface TransportObservers {
  onChunk(bytes: Uint8Array): void;
  onDisconnect(): void;
  onProgress?(step: ConnectStep): void;
  /** The supported model matched from the connected device's services. */
  onIdentified?(model: ScaleModel): void;
}
/** A device seen by an in-app scan; `rssi` is the latest reading in dBm. */
export interface ScanCandidate {
  id: string;
  name?: string;
  rssi?: number;
}
export interface ScanObservers {
  /** The full list so far, already sorted; called on every change. */
  onCandidates(list: readonly ScanCandidate[]): void;
}
/** In-app discovery, present only where the platform lets the app list devices. */
export interface ScanSupport {
  /** Scans for a bounded time; resolves when the scan ends, rejects when cancelled. */
  start(observers: ScanObservers): Promise<void>;
  /** Connects to a scanned device and identifies it by its services. */
  connect(
    candidate: ScanCandidate,
    observers: TransportObservers,
  ): Promise<void>;
}
export interface ScaleTransport {
  /** Remembered scale first, then the chooser filtered to supported scales. */
  connect(observers: TransportObservers): Promise<void>;
  /** The platform chooser without filters; the pick must identify as a supported scale. */
  connectAll(observers: TransportObservers): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(): void;
  scan?: ScanSupport;
}
export interface RememberedScale {
  id: string;
  name?: string;
}
/** Stores the last chosen scale so a later connection can skip the chooser. */
export interface RememberedDevice {
  load(): RememberedScale | null;
  save(value: RememberedScale): void;
  clear(): void;
}
/** Storage failures must never block connecting. */
export function guardedMemory(memory: RememberedDevice | undefined) {
  return {
    load(): RememberedScale | null {
      try {
        const value = memory?.load() ?? null;
        return value && typeof value.id === "string" && value.id !== ""
          ? value
          : null;
      } catch {
        return null;
      }
    },
    save(id: string, name: string | undefined) {
      try {
        memory?.save(name === undefined ? { id } : { id, name });
      } catch {
        // A scale that cannot be remembered still connects.
      }
    },
  };
}
