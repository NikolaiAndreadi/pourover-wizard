import { BleClient } from "@capacitor-community/bluetooth-le";
import { bookooUuids } from "@/scale/bookoo/codec";
import type { ScaleTransport } from "@/scale/contracts";
import type { ServiceSelection } from "./web";

export type NativeRadio = Pick<
  typeof BleClient,
  | "initialize"
  | "requestDevice"
  | "connect"
  | "disconnect"
  | "getServices"
  | "startNotifications"
  | "stopNotifications"
  | "write"
  | "writeWithoutResponse"
>;

// One radio backs both lab and brew adapters. Serialize their complete operations,
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

/** Foreground central-role connection. The chooser is always explicitly opened. */
export function createNativeTransport(
  selection: ServiceSelection = bookooUuids,
  radio: NativeRadio = BleClient,
): ScaleTransport {
  for (const uuid of Object.values(selection))
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        uuid,
      )
    )
      throw new Error("Supply full service/characteristic UUIDs.");
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
        .stopNotifications(binding.id, selection.service, selection.notify)
        .catch(() => {});
    // Also release a connection whose connect promise rejected after partial setup.
    await radio.disconnect(binding.id).catch(() => {});
  };
  const current = (mine: number) => {
    if (mine !== generation) throw new Error("Connection cancelled.");
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
          const device = await radio.requestDevice({
            optionalServices: [selection.service],
          });
          current(mine);
          const binding = {
            id: device.deviceId,
            connected: false,
            subscribed: false,
            writeWithResponse: false,
            writable: false,
          };
          active = binding;
          await radio.connect(binding.id, () => {
            if (mine !== generation || active !== binding) return;
            generation++;
            binding.connected = false;
            void queue(release);
            observers.onDisconnect();
          });
          current(mine);
          binding.connected = true;
          const services = await radio.getServices(binding.id);
          current(mine);
          const service = services.find(
            (value) =>
              canonicalUuid(value.uuid) === selection.service.toLowerCase(),
          );
          const notify = service?.characteristics.find(
            (value) =>
              canonicalUuid(value.uuid) === selection.notify.toLowerCase(),
          );
          const command = service?.characteristics.find(
            (value) =>
              canonicalUuid(value.uuid) === selection.command.toLowerCase(),
          );
          if (!notify?.properties.notify && !notify?.properties.indicate)
            throw new Error(
              "Scale notification characteristic is unavailable.",
            );
          if (
            !command?.properties.write &&
            !command?.properties.writeWithoutResponse
          )
            throw new Error("Command characteristic is not writable.");
          binding.writeWithResponse = !!command.properties.write;
          binding.writable = true;
          // A partially completed subscription must also be stopped on failure.
          binding.subscribed = true;
          await radio.startNotifications(
            binding.id,
            selection.service,
            selection.notify,
            (view) => {
              if (mine !== generation || active !== binding) return;
              observers.onChunk(
                new Uint8Array(
                  view.buffer,
                  view.byteOffset,
                  view.byteLength,
                ).slice(),
              );
            },
          );
          current(mine);
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
          selection.service,
          selection.command,
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
