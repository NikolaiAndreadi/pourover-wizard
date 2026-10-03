import { bookooMatch, bookooUuids } from "@/scale/bookoo/codec";
import {
  guardedMemory,
  type RememberedDevice,
  type RememberedScale,
  type ScaleTransport,
  type TransportObservers,
} from "@/scale/contracts";

interface Characteristic extends EventTarget {
  value?: DataView;
  properties: { write: boolean; writeWithoutResponse: boolean };
  startNotifications(): Promise<Characteristic>;
  stopNotifications(): Promise<Characteristic>;
  writeValueWithResponse(bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  writeValueWithoutResponse(bytes: Uint8Array<ArrayBuffer>): Promise<void>;
}
interface Service {
  getCharacteristic(uuid: string): Promise<Characteristic>;
}
interface Server {
  connected: boolean;
  connect(): Promise<Server>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<Service>;
}
interface Device extends EventTarget {
  id?: string;
  name?: string;
  gatt?: Server;
  watchAdvertisements?(options?: { signal?: AbortSignal }): Promise<void>;
}
export interface RequestOptions {
  filters: ({ services: string[] } | { namePrefix: string })[];
  optionalServices: string[];
}
export interface Radio {
  requestDevice(options: RequestOptions): Promise<Device>;
  /** Permitted devices; absent unless the browser enables persistent permissions. */
  getDevices?(): Promise<Device[]>;
}
export interface WebTiming {
  /** How long to wait for a remembered scale's advertisement before connecting anyway. */
  advertisementMs: number;
  /** Bound on connecting to a remembered scale before offering the chooser. */
  rememberedConnectMs: number;
}
const defaultTiming: WebTiming = {
  advertisementMs: 4000,
  rememberedConnectMs: 10000,
};
// Filters are ORed: either the advertised service or the name prefix matches.
const requestOptions = (): RequestOptions => ({
  filters: [
    { services: [bookooMatch.service] },
    { namePrefix: bookooMatch.namePrefix },
  ],
  optionalServices: [bookooUuids.service],
});

export function supportsScaleConnection(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!(navigator as Navigator & { bluetooth?: Radio }).bluetooth
  );
}
/** Resolves on the first advertisement, a timeout, failure to watch, or abort. */
async function awaitAdvertisement(
  device: Device,
  ms: number,
  cancel: AbortSignal,
): Promise<void> {
  if (typeof device.watchAdvertisements !== "function") return;
  const watch = new AbortController();
  let finish = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const timer = setTimeout(finish, ms);
  device.addEventListener("advertisementreceived", finish);
  cancel.addEventListener("abort", finish);
  try {
    device.watchAdvertisements({ signal: watch.signal }).catch(finish);
    await done;
  } catch {
    // Watching is optional; connecting is still attempted.
  } finally {
    clearTimeout(timer);
    device.removeEventListener("advertisementreceived", finish);
    cancel.removeEventListener("abort", finish);
    watch.abort();
  }
}
async function findPermitted(radio: Radio, id: string) {
  try {
    const devices = (await radio.getDevices?.()) ?? [];
    return devices.find((device) => device.id === id) ?? null;
  } catch {
    return null;
  }
}
export function createWebTransport(
  radio?: Radio,
  remembered?: RememberedDevice,
  timing: WebTiming = defaultTiming,
): ScaleTransport {
  const adapter =
    radio ??
    (typeof navigator !== "undefined"
      ? (navigator as Navigator & { bluetooth?: Radio }).bluetooth
      : undefined);
  const memory = guardedMemory(remembered);
  let generation = 0;
  let waiting: AbortController | null = null;
  // After the remembered scale fails, the chooser may need a fresh tap.
  let chooseNext = false;
  let active: {
    device: Device;
    server: Server;
    notify: Characteristic | null;
    command: Characteristic | null;
    changed: EventListener;
    disconnected: EventListener;
  } | null = null;
  const release = () => {
    const binding = active;
    active = null;
    if (!binding) return;
    binding.device.removeEventListener(
      "gattserverdisconnected",
      binding.disconnected,
    );
    binding.notify?.removeEventListener(
      "characteristicvaluechanged",
      binding.changed,
    );
    // Disconnect releases subscriptions; no asynchronous stop can race a reconnect.
    if (binding.server.connected) binding.server.disconnect();
  };
  const cancelled = (mine: number) => {
    if (mine !== generation) throw new Error("Connection cancelled.");
  };
  /** Opens GATT and subscribes; on failure releases only its own binding. */
  const link = async (
    device: Device,
    mine: number,
    observers: TransportObservers,
    connectMs?: number,
  ) => {
    const server = device.gatt;
    if (!server) throw new Error("Selected device has no GATT server.");
    const binding = {
      device,
      server,
      notify: null as Characteristic | null,
      command: null as Characteristic | null,
      changed: (() => {
        if (mine !== generation || !binding.notify?.value) return;
        const view = binding.notify.value;
        observers.onChunk(
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice(),
        );
      }) as EventListener,
      disconnected: (() => {
        if (mine !== generation) return;
        generation++;
        release();
        observers.onDisconnect();
      }) as EventListener,
    };
    active = binding;
    device.addEventListener("gattserverdisconnected", binding.disconnected);
    const current = () => {
      if (mine !== generation) {
        if (server.connected && active?.server !== server) server.disconnect();
        throw new Error("Connection cancelled.");
      }
    };
    try {
      await (connectMs === undefined
        ? server.connect()
        : new Promise<Server>((resolve, reject) => {
            const timer = setTimeout(() => {
              // Disconnecting aborts the pending connection attempt.
              server.disconnect();
              reject(new Error("Scale did not respond."));
            }, connectMs);
            server.connect().then(
              (value) => {
                clearTimeout(timer);
                resolve(value);
              },
              (error: unknown) => {
                clearTimeout(timer);
                reject(error);
              },
            );
          }));
      current();
      const service = await server.getPrimaryService(bookooUuids.service);
      current();
      binding.notify = await service.getCharacteristic(bookooUuids.notify);
      current();
      binding.command = await service.getCharacteristic(bookooUuids.command);
      current();
      binding.notify.addEventListener(
        "characteristicvaluechanged",
        binding.changed,
      );
      await binding.notify.startNotifications();
      current();
    } catch (error) {
      if (active === binding) release();
      throw error;
    }
  };
  /** Connects to the remembered scale without the chooser, if the browser allows. */
  const reconnect = async (
    radio: Radio,
    saved: RememberedScale,
    mine: number,
    observers: TransportObservers,
    cancel: AbortSignal,
  ): Promise<"connected" | "unavailable" | "failed"> => {
    const device = await findPermitted(radio, saved.id);
    cancelled(mine);
    if (!device) return "unavailable";
    observers.onProgress?.({
      kind: "device",
      name: device.name ?? saved.name,
    });
    try {
      await awaitAdvertisement(device, timing.advertisementMs, cancel);
      cancelled(mine);
      await link(device, mine, observers, timing.rememberedConnectMs);
      return "connected";
    } catch {
      cancelled(mine);
      return "failed";
    }
  };
  return {
    async connect(observers) {
      const mine = ++generation;
      waiting?.abort();
      release();
      if (!adapter)
        throw new Error(
          "Scale connection requires Chrome with Web Bluetooth support.",
        );
      const wait = new AbortController();
      waiting = wait;
      try {
        const saved = chooseNext ? null : memory.load();
        chooseNext = false;
        // Without a remembered scale the chooser opens synchronously in the tap.
        const outcome =
          saved && typeof adapter.getDevices === "function"
            ? await reconnect(adapter, saved, mine, observers, wait.signal)
            : "unavailable";
        if (outcome === "connected") return;
        observers.onProgress?.({ kind: "chooser" });
        let device: Device;
        try {
          device = await adapter.requestDevice(requestOptions());
        } catch (error) {
          if (outcome !== "failed") throw error;
          // The remembered attempt may outlast the tap that allows the chooser,
          // so the next tap opens the chooser directly.
          chooseNext = true;
          if (error instanceof Error && error.name === "SecurityError")
            throw new Error(
              "Couldn't reach your scale. Tap Connect scale to choose it.",
            );
          throw error;
        }
        cancelled(mine);
        observers.onProgress?.({ kind: "device", name: device.name });
        await link(device, mine, observers);
        if (device.id) memory.save(device.id, device.name);
      } catch (error) {
        if (mine === generation) {
          generation++;
          release();
        }
        throw error;
      } finally {
        if (waiting === wait) waiting = null;
      }
    },
    async write(bytes) {
      const binding = active;
      const mine = generation;
      if (!binding?.server.connected || !binding.command)
        throw new Error("Scale is disconnected.");
      const copy = Uint8Array.from(bytes);
      if (binding.command.properties.write)
        await binding.command.writeValueWithResponse(copy);
      else if (binding.command.properties.writeWithoutResponse)
        await binding.command.writeValueWithoutResponse(copy);
      else throw new Error("Command characteristic is not writable.");
      if (mine !== generation)
        throw new Error("Scale disconnected during command.");
    },
    disconnect() {
      generation++;
      waiting?.abort();
      release();
    },
  };
}
