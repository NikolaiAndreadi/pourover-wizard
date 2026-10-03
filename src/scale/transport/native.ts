import { BleClient } from "@capacitor-community/bluetooth-le";
import { bookooMatch, bookooUuids } from "@/scale/bookoo/codec";
import {
  guardedMemory,
  type RememberedDevice,
  type ScaleTransport,
  type TransportObservers,
} from "@/scale/contracts";

export type NativeRadio = Pick<
  typeof BleClient,
  | "initialize"
  | "requestDevice"
  | "getDevices"
  | "connect"
  | "disconnect"
  | "getServices"
  | "startNotifications"
  | "stopNotifications"
  | "write"
  | "writeWithoutResponse"
>;

// One radio backs successive brew adapters. Serialize their complete operations,
// including teardown, so replacing an adapter cannot disconnect its successor.
const radioTails = new WeakMap<NativeRadio, Promise<unknown>>();
const canonicalUuid = (uuid: string) => {
  const value = uuid.toLowerCase();
  if (/^[0-9a-f]{4}$/.test(value))
    return `0000${value}-0000-1000-8000-00805f9b34fb`;
  if (/^[0-9a-f]{8}$/.test(value))
    return `${value}-0000-1000-8000-00805f9b34fb`;
  return value;
};

/**
 * Foreground central-role connection. A remembered scale is retrieved by id and
 * connected with a bounded attempt; otherwise the filtered chooser opens.
 * The plugin ANDs request criteria, so the chooser filters by the observed name
 * prefix only: whether the scale advertises its service UUID is unverified.
 */
export function createNativeTransport(
  radio: NativeRadio = BleClient,
  remembered?: RememberedDevice,
  rememberedConnectMs = 5000,
): ScaleTransport {
  const memory = guardedMemory(remembered);
  let generation = 0;
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
    connected: boolean;
    subscribed: boolean;
    writeWithResponse: boolean;
    writable: boolean;
  } | null = null;
  const release = async () => {
    const binding = active;
    active = null;
    if (!binding) return;
    if (binding.subscribed)
      await radio
        .stopNotifications(binding.id, bookooUuids.service, bookooUuids.notify)
        .catch(() => {});
    // Also release a connection whose connect promise rejected after partial setup.
    await radio.disconnect(binding.id).catch(() => {});
  };
  const current = (mine: number) => {
    if (mine !== generation) throw new Error("Connection cancelled.");
  };
  const link = async (
    id: string,
    mine: number,
    observers: TransportObservers,
    timeout?: number,
  ) => {
    const binding = {
      id,
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
    const service = services.find(
      (value) =>
        canonicalUuid(value.uuid) === bookooUuids.service.toLowerCase(),
    );
    const notify = service?.characteristics.find(
      (value) => canonicalUuid(value.uuid) === bookooUuids.notify.toLowerCase(),
    );
    const command = service?.characteristics.find(
      (value) =>
        canonicalUuid(value.uuid) === bookooUuids.command.toLowerCase(),
    );
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
      bookooUuids.service,
      bookooUuids.notify,
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
      observers.onProgress?.({
        kind: "device",
        name: known.name ?? saved.name,
      });
      await link(known.deviceId, mine, observers, rememberedConnectMs);
      return true;
    } catch {
      current(mine);
      await release();
      return false;
    }
  };
  return {
    connect(observers) {
      const mine = ++generation;
      return queue(async () => {
        await release();
        current(mine);
        try {
          await radio.initialize();
          current(mine);
          if (await reconnect(mine, observers)) return;
          observers.onProgress?.({ kind: "chooser" });
          const device = await radio.requestDevice({
            namePrefix: bookooMatch.namePrefix,
            optionalServices: [bookooUuids.service],
          });
          current(mine);
          observers.onProgress?.({ kind: "device", name: device.name });
          await link(device.deviceId, mine, observers);
          memory.save(device.deviceId, device.name);
        } catch (error) {
          await release();
          throw error;
        }
      });
    },
    write(bytes) {
      const mine = generation;
      const copy = Uint8Array.from(bytes);
      return queue(async () => {
        current(mine);
        const binding = active;
        if (!binding?.connected || !binding.writable)
          throw new Error("Scale is disconnected.");
        const write = binding.writeWithResponse
          ? radio.write.bind(radio)
          : radio.writeWithoutResponse.bind(radio);
        await write(
          binding.id,
          bookooUuids.service,
          bookooUuids.command,
          new DataView(copy.buffer),
        );
        current(mine);
      });
    },
    disconnect() {
      generation++;
      // Serial cleanup prevents a delayed disconnect from tearing down a reconnect.
      void queue(release);
    },
  };
}
