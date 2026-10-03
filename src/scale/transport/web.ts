import { bookooUuids } from "@/scale/bookoo/codec";
import type { ScaleTransport } from "@/scale/contracts";

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
  gatt?: Server;
}
export interface Radio {
  requestDevice(options: {
    acceptAllDevices: true;
    optionalServices: string[];
  }): Promise<Device>;
}
export interface ServiceSelection {
  service: string;
  notify: string;
  command: string;
}

export function supportsScaleConnection(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!(navigator as Navigator & { bluetooth?: Radio }).bluetooth
  );
}
export function createWebTransport(
  selection: ServiceSelection = bookooUuids,
  radio?: Radio,
): ScaleTransport {
  const adapter =
    radio ??
    (typeof navigator !== "undefined"
      ? (navigator as Navigator & { bluetooth?: Radio }).bluetooth
      : undefined);
  for (const uuid of Object.values(selection))
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        uuid,
      )
    )
      throw new Error("Supply full service/characteristic UUIDs.");
  let generation = 0;
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
  return {
    async connect(observers) {
      generation++;
      const mine = generation;
      release();
      if (!adapter)
        throw new Error(
          "Scale connection requires Chrome with Web Bluetooth support.",
        );
      const device = await adapter.requestDevice({
        acceptAllDevices: true,
        optionalServices: [selection.service],
      });
      if (mine !== generation) throw new Error("Connection cancelled.");
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
            new Uint8Array(
              view.buffer,
              view.byteOffset,
              view.byteLength,
            ).slice(),
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
          if (server.connected && active?.server !== server)
            server.disconnect();
          throw new Error("Connection cancelled.");
        }
      };
      try {
        await server.connect();
        current();
        const service = await server.getPrimaryService(selection.service);
        current();
        binding.notify = await service.getCharacteristic(selection.notify);
        current();
        binding.command = await service.getCharacteristic(selection.command);
        current();
        binding.notify.addEventListener(
          "characteristicvaluechanged",
          binding.changed,
        );
        await binding.notify.startNotifications();
        current();
      } catch (error) {
        if (mine === generation) {
          generation++;
          release();
        }
        throw error;
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
      release();
    },
  };
}
