import { BleClient } from "@capacitor-community/bluetooth-le";
import { sortCandidates } from "@/scale/candidates";
import {
  guardedMemory,
  type RememberedDevice,
  type ScaleTransport,
  type ScanCandidate,
  type ScanObservers,
  type TransportObservers,
} from "@/scale/contracts";
import {
  canonicalUuid,
  identify,
  namePrefixes,
  optionalServices,
  type ScaleModel,
} from "@/scale/supported";

export type NativeRadio = Pick<
  typeof BleClient,
  | "initialize"
  | "requestDevice"
  | "requestLEScan"
  | "stopLEScan"
  | "getDevices"
  | "connect"
  | "disconnect"
  | "getServices"
  | "startNotifications"
  | "stopNotifications"
  | "write"
  | "writeWithoutResponse"
>;
export interface NativeTiming {
  /** Bound on connecting to a remembered scale before offering the chooser. */
  rememberedConnectMs: number;
  /** How long an in-app scan collects advertisements before it stops. */
  scanMs: number;
}
const defaultTiming: NativeTiming = { rememberedConnectMs: 5000, scanMs: 6000 };

// One radio backs successive brew adapters. Serialize their complete operations,
// including teardown, so replacing an adapter cannot disconnect its successor.
const radioTails = new WeakMap<NativeRadio, Promise<unknown>>();
/**
 * The plugin ANDs request criteria, so the chooser filters by the observed name
 * prefix when the registry documents exactly one; whether scales advertise their
 * service UUID is unverified. Several prefixes cannot be ORed, so the service
 * filter is the fallback.
 */
const chooserOptions = () => {
  const prefixes = namePrefixes();
  const [prefix] = prefixes;
  return prefixes.length === 1 && prefix !== undefined
    ? { namePrefix: prefix, optionalServices: optionalServices() }
    : { services: optionalServices(), optionalServices: optionalServices() };
};

/**
 * Foreground central-role connection. A remembered scale is retrieved by id and
 * connected with a bounded attempt; otherwise the filtered chooser opens. An
 * in-app scan lists everything in range for the user to pick from.
 */
export function createNativeTransport(
  radio: NativeRadio = BleClient,
  remembered?: RememberedDevice,
  timing: Partial<NativeTiming> = {},
): ScaleTransport {
  const { rememberedConnectMs, scanMs } = { ...defaultTiming, ...timing };
  const memory = guardedMemory(remembered);
  let generation = 0;
  /** Ends a scan early; set only while one is collecting. */
  let stopScan: (() => void) | null = null;
  const queue = <T>(work: () => Promise<T>): Promise<T> => {
    const next = (radioTails.get(radio) ?? Promise.resolve()).then(work);
    radioTails.set(
      radio,
      next.catch(() => {}),
    );
    return next;
  };
  let active: {
    id: string;
    model: ScaleModel | null;
    connected: boolean;
    subscribed: boolean;
    writeWithResponse: boolean;
    writable: boolean;
  } | null = null;
  const release = async () => {
    const binding = active;
    active = null;
    if (!binding) return;
    if (binding.subscribed && binding.model)
      await radio
        .stopNotifications(
          binding.id,
          binding.model.service,
          binding.model.notify,
        )
        .catch(() => {});
    // Also release a connection whose connect promise rejected after partial setup.
    await radio.disconnect(binding.id).catch(() => {});
  };
  const current = (mine: number) => {
    if (mine !== generation) throw new Error("Connection cancelled.");
  };
  /** Supersedes any pending attempt or scan and returns the new generation. */
  const supersede = () => {
    generation++;
    stopScan?.();
    return generation;
  };
  const link = async (
    id: string,
    name: string | undefined,
    mine: number,
    observers: TransportObservers,
    timeout?: number,
  ) => {
    const binding = {
      id,
      model: null as ScaleModel | null,
      connected: false,
      subscribed: false,
      writeWithResponse: false,
      writable: false,
    };
    active = binding;
    await radio.connect(
      binding.id,
      () => {
        if (mine !== generation || active !== binding) return;
        generation++;
        binding.connected = false;
        void queue(release);
        observers.onDisconnect();
      },
      timeout === undefined ? undefined : { timeout },
    );
    current(mine);
    binding.connected = true;
    const services = await radio.getServices(binding.id);
    current(mine);
    const model = identify(
      services.map((value) => value.uuid),
      name,
    );
    const service = model
      ? services.find(
          (value) => canonicalUuid(value.uuid) === canonicalUuid(model.service),
        )
      : undefined;
    if (!model || !service)
      throw new Error("This device is not a supported scale.");
    binding.model = model;
    observers.onIdentified?.(model);
    const characteristic = (uuid: string) =>
      service.characteristics.find(
        (value) => canonicalUuid(value.uuid) === canonicalUuid(uuid),
      );
    const notify = characteristic(model.notify);
    const command = characteristic(model.command);
    if (!notify?.properties.notify && !notify?.properties.indicate)
      throw new Error("Scale notification characteristic is unavailable.");
    if (!command?.properties.write && !command?.properties.writeWithoutResponse)
      throw new Error("Command characteristic is not writable.");
    binding.writeWithResponse = !!command.properties.write;
    binding.writable = true;
    // A partially completed subscription must also be stopped on failure.
    binding.subscribed = true;
    await radio.startNotifications(
      binding.id,
      model.service,
      model.notify,
      (view) => {
        if (mine !== generation || active !== binding) return;
        observers.onChunk(
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice(),
        );
      },
    );
    current(mine);
  };
  /** Connects to the remembered scale by id; false means use the chooser. */
  const reconnect = async (mine: number, observers: TransportObservers) => {
    const saved = memory.load();
    if (!saved) return false;
    try {
      const known = (await radio.getDevices([saved.id])).find(
        (device) => device.deviceId === saved.id,
      );
      current(mine);
      if (!known) return false;
      const name = known.name ?? saved.name;
      observers.onProgress?.({ kind: "device", name });
      await link(known.deviceId, name, mine, observers, rememberedConnectMs);
      return true;
    } catch {
      current(mine);
      await release();
      return false;
    }
  };
  /** Opens the plugin chooser with the given criteria, links the pick and remembers it. */
  const choose = async (
    options: Parameters<NativeRadio["requestDevice"]>[0],
    mine: number,
    observers: TransportObservers,
  ) => {
    observers.onProgress?.({ kind: "chooser" });
    const device = await radio.requestDevice(options);
    current(mine);
    observers.onProgress?.({ kind: "device", name: device.name });
    await link(device.deviceId, device.name, mine, observers);
    memory.save(device.deviceId, device.name);
  };
  /** Runs one connection attempt in the radio queue, releasing on failure. */
  const attempt = (mine: number, run: () => Promise<void>): Promise<void> =>
    queue(async () => {
      await release();
      current(mine);
      try {
        await radio.initialize();
        current(mine);
        await run();
      } catch (error) {
        await release();
        throw error;
      }
    });
  return {
    connect(observers) {
      const mine = supersede();
      return attempt(mine, async () => {
        if (await reconnect(mine, observers)) return;
        await choose(chooserOptions(), mine, observers);
      });
    },
    connectAll(observers) {
      const mine = supersede();
      return attempt(mine, () =>
        choose({ optionalServices: optionalServices() }, mine, observers),
      );
    },
    scan: {
      start(observers: ScanObservers) {
        const mine = supersede();
        return attempt(mine, async () => {
          const found = new Map<string, ScanCandidate>();
          let finish = () => {};
          const ended = new Promise<void>((resolve) => {
            finish = resolve;
          });
          const timer = setTimeout(finish, scanMs);
          let collecting = true;
          stopScan = finish;
          try {
            // Duplicates keep the latest signal strength per device.
            await radio.requestLEScan({ allowDuplicates: true }, (result) => {
              if (!collecting || mine !== generation) return;
              const name = result.localName ?? result.device.name;
              found.set(result.device.deviceId, {
                id: result.device.deviceId,
                ...(name === undefined ? {} : { name }),
                ...(result.rssi === undefined ? {} : { rssi: result.rssi }),
              });
              observers.onCandidates(sortCandidates([...found.values()]));
            });
            await ended;
          } finally {
            collecting = false;
            clearTimeout(timer);
            if (stopScan === finish) stopScan = null;
            await radio.stopLEScan().catch(() => {});
          }
          current(mine);
        });
      },
      connect(candidate: ScanCandidate, observers: TransportObservers) {
        const mine = supersede();
        return attempt(mine, async () => {
          observers.onProgress?.({ kind: "device", name: candidate.name });
          await link(candidate.id, candidate.name, mine, observers);
          memory.save(candidate.id, candidate.name);
        });
      },
    },
    write(bytes) {
      const mine = generation;
      const copy = Uint8Array.from(bytes);
      return queue(async () => {
        current(mine);
        const binding = active;
        if (!binding?.connected || !binding.writable || !binding.model)
          throw new Error("Scale is disconnected.");
        const write = binding.writeWithResponse
          ? radio.write.bind(radio)
          : radio.writeWithoutResponse.bind(radio);
        await write(
          binding.id,
          binding.model.service,
          binding.model.command,
          new DataView(copy.buffer),
        );
        current(mine);
      });
    },
    disconnect() {
      supersede();
      // Serial cleanup prevents a delayed disconnect from tearing down a reconnect.
      void queue(release);
    },
  };
}
