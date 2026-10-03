/** Connection progress reported before the scale link is ready. */
export type ConnectStep =
  | { kind: "chooser" }
  | { kind: "device"; name: string | undefined };
export interface TransportObservers {
  onChunk(bytes: Uint8Array): void;
  onDisconnect(): void;
  onProgress?(step: ConnectStep): void;
}
export interface ScaleTransport {
  connect(observers: TransportObservers): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(): void;
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
