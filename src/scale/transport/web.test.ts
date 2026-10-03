import { describe, expect, it, vi } from "vitest";
import { bookooUuids } from "@/scale/bookoo/codec";
import type { RememberedDevice, RememberedScale } from "@/scale/contracts";
import { createWebTransport, type Radio } from "@/scale/transport/web";

const filtered = {
  filters: [{ services: [bookooUuids.service] }, { namePrefix: "BOOKOO_SC" }],
  optionalServices: [bookooUuids.service],
};
const quick = { advertisementMs: 20, rememberedConnectMs: 50 };
function memory(initial: RememberedScale | null = null) {
  let value = initial;
  return {
    load: vi.fn(() => value),
    save: vi.fn((next: RememberedScale) => {
      value = next;
    }),
    clear: vi.fn(() => {
      value = null;
    }),
  } satisfies RememberedDevice;
}
const observers = () => ({ onChunk: vi.fn(), onDisconnect: vi.fn() });

class TestCharacteristic extends EventTarget {
  value = new DataView(new ArrayBuffer(0));
  properties = { write: true, writeWithoutResponse: false };
  starts = 0;
  writes: number[][] = [];
  fail = false;
  async startNotifications() {
    this.starts++;
    return this;
  }
  async stopNotifications() {
    return this;
  }
  async writeValueWithResponse(bytes: Uint8Array) {
    if (this.fail) throw new Error("write failure");
    this.writes.push(Array.from(bytes));
  }
  async writeValueWithoutResponse(bytes: Uint8Array) {
    return this.writeValueWithResponse(bytes);
  }
  emit(bytes: number[]) {
    this.value = new DataView(
      Uint8Array.from([99, ...bytes, 99]).buffer,
      1,
      bytes.length,
    );
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}
function fixture() {
  const notify = new TestCharacteristic();
  const command = new TestCharacteristic();
  let disconnects = 0;
  let connectDelay: Promise<void> | null = null;
  const server = {
    connected: false,
    async connect() {
      if (connectDelay) await connectDelay;
      this.connected = true;
      return this;
    },
    disconnect() {
      this.connected = false;
      disconnects++;
    },
    async getPrimaryService(uuid: string) {
      expect(uuid).toBe(bookooUuids.service);
      return {
        async getCharacteristic(id: string) {
          return id === bookooUuids.notify ? notify : command;
        },
      };
    },
  };
  const device = Object.assign(new EventTarget(), {
    id: "picked",
    name: "BOOKOO_SC 000000",
    gatt: server,
  });
  const options: unknown[] = [];
  const radio: Radio = {
    async requestDevice(value) {
      options.push(value);
      return device;
    },
  };
  return {
    notify,
    command,
    device,
    server,
    radio,
    options,
    disconnects: () => disconnects,
    delay: (promise: Promise<void>) => {
      connectDelay = promise;
    },
  };
}
describe("mock transport lifecycle (does not prove device acceptance)", () => {
  it("filters the chooser to BOOKOO scales, requests only explicit service access, preserves view bounds, writes commands, and tears down once", async () => {
    const f = fixture();
    const transport = createWebTransport(f.radio);
    const chunks: Uint8Array[] = [];
    let lost = 0;
    await transport.connect({
      onChunk: (bytes) => chunks.push(bytes),
      onDisconnect: () => lost++,
    });
    expect(f.options).toEqual([filtered]);
    f.notify.emit([3, 11, 9]);
    expect(Array.from(chunks[0]!)).toEqual([3, 11, 9]);
    await transport.write(Uint8Array.of(3, 10));
    expect(f.command.writes).toEqual([[3, 10]]);
    f.server.connected = false;
    f.device.dispatchEvent(new Event("gattserverdisconnected"));
    expect(lost).toBe(1);
    f.notify.emit([1]);
    expect(chunks).toHaveLength(1);
    transport.disconnect();
    transport.disconnect();
    expect(f.disconnects()).toBe(0);
    await expect(transport.write(Uint8Array.of(1))).rejects.toThrow(
      "disconnected",
    );
  });
  it("ignores superseded listeners, supports fallback writes, and surfaces command failure", async () => {
    const f = fixture();
    const transport = createWebTransport(f.radio);
    let count = 0;
    await transport.connect({ onChunk: () => count++, onDisconnect: () => {} });
    await transport.connect({
      onChunk: () => (count += 10),
      onDisconnect: () => {},
    });
    f.notify.emit([1]);
    expect(count).toBe(10);
    expect(f.disconnects()).toBe(1);
    f.command.properties = { write: false, writeWithoutResponse: true };
    await transport.write(Uint8Array.of(7));
    expect(f.command.writes).toEqual([[7]]);
    f.command.fail = true;
    await expect(transport.write(Uint8Array.of(8))).rejects.toThrow(
      "write failure",
    );
    transport.disconnect();
    expect(f.disconnects()).toBe(2);
  });
  it("cancels a connection pending inside GATT and releases the late server", async () => {
    const f = fixture();
    let finish: () => void = () => {};
    f.delay(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const transport = createWebTransport(f.radio);
    const pending = transport.connect({
      onChunk: () => {},
      onDisconnect: () => {},
    });
    await Promise.resolve();
    transport.disconnect();
    finish();
    await expect(pending).rejects.toThrow("cancelled");
    expect(f.server.connected).toBe(false);
    expect(f.notify.starts).toBe(0);
  });
  it("cancels an open chooser without connecting", async () => {
    const f = fixture();
    let choose: (device: typeof f.device) => void = () => {};
    const transport = createWebTransport({
      requestDevice() {
        return new Promise((resolve) => {
          choose = resolve;
        });
      },
    });
    const pending = transport.connect({
      onChunk: () => {},
      onDisconnect: () => {},
    });
    transport.disconnect();
    choose(f.device);
    await expect(pending).rejects.toThrow("cancelled");
    expect(f.server.connected).toBe(false);
  });
});
describe("remembered scale (mocked radio; real Chrome support is flag-dependent)", () => {
  it("remembers a chooser pick and reports chooser then device progress", async () => {
    const f = fixture();
    const saved = memory();
    const steps: unknown[] = [];
    await createWebTransport(f.radio, saved, quick).connect({
      ...observers(),
      onProgress: (step) => steps.push(step),
    });
    expect(saved.save).toHaveBeenCalledWith({
      id: "picked",
      name: "BOOKOO_SC 000000",
    });
    expect(steps).toEqual([
      { kind: "chooser" },
      { kind: "device", name: "BOOKOO_SC 000000" },
    ]);
  });
  it("opens the chooser when getDevices is absent", async () => {
    const f = fixture();
    const saved = memory({ id: "picked" });
    await createWebTransport(f.radio, saved, quick).connect(observers());
    expect(f.options).toEqual([filtered]);
    expect(f.server.connected).toBe(true);
  });
  it("connects to the permitted remembered device without the chooser", async () => {
    const f = fixture();
    const getDevices = vi.fn(async () => [
      Object.assign(new EventTarget(), { id: "other" }),
      f.device,
    ]);
    const saved = memory({ id: "picked", name: "BOOKOO_SC 000000" });
    const steps: unknown[] = [];
    const watched: AbortSignal[] = [];
    Object.assign(f.device, {
      async watchAdvertisements(options: { signal: AbortSignal }) {
        watched.push(options.signal);
        queueMicrotask(() =>
          f.device.dispatchEvent(new Event("advertisementreceived")),
        );
      },
    });
    const transport = createWebTransport({ ...f.radio, getDevices }, saved, {
      advertisementMs: 60000,
      rememberedConnectMs: 60000,
    });
    const watching = observers();
    await transport.connect({
      ...watching,
      onProgress: (step) => steps.push(step),
    });
    expect(f.options).toEqual([]);
    expect(steps).toEqual([{ kind: "device", name: "BOOKOO_SC 000000" }]);
    expect(watched[0]?.aborted).toBe(true);
    expect(f.server.connected).toBe(true);
    f.notify.emit([4]);
    expect(watching.onChunk).toHaveBeenCalledOnce();
    await transport.write(Uint8Array.of(3));
    expect(f.command.writes).toEqual([[3]]);
  });
  it("connects anyway when no advertisement arrives in time", async () => {
    const f = fixture();
    Object.assign(f.device, { watchAdvertisements: async () => {} });
    const transport = createWebTransport(
      { ...f.radio, getDevices: async () => [f.device] },
      memory({ id: "picked" }),
      quick,
    );
    await transport.connect(observers());
    expect(f.options).toEqual([]);
    expect(f.server.connected).toBe(true);
  });
  it("falls back to the chooser when the remembered device is not permitted", async () => {
    const f = fixture();
    const saved = memory({ id: "gone" });
    const transport = createWebTransport(
      { ...f.radio, getDevices: async () => [] },
      saved,
      quick,
    );
    await transport.connect(observers());
    expect(f.options).toEqual([filtered]);
    expect(saved.save).toHaveBeenCalledWith({
      id: "picked",
      name: "BOOKOO_SC 000000",
    });
  });
  it("falls back to the chooser and overwrites memory when the remembered device fails", async () => {
    const f = fixture();
    const stale = Object.assign(new EventTarget(), {
      id: "stale",
      gatt: {
        connected: false,
        connect: () => new Promise<never>(() => {}),
        disconnect: vi.fn(),
        getPrimaryService: vi.fn(),
      },
    });
    const saved = memory({ id: "stale" });
    const steps: unknown[] = [];
    const transport = createWebTransport(
      { ...f.radio, getDevices: async () => [stale] },
      saved,
      quick,
    );
    await transport.connect({
      ...observers(),
      onProgress: (step) => steps.push(step),
    });
    expect(stale.gatt.disconnect).toHaveBeenCalled();
    expect(f.options).toEqual([filtered]);
    expect(f.server.connected).toBe(true);
    expect(saved.load()).toEqual({ id: "picked", name: "BOOKOO_SC 000000" });
    expect(steps).toEqual([
      { kind: "device", name: undefined },
      { kind: "chooser" },
      { kind: "device", name: "BOOKOO_SC 000000" },
    ]);
  });
  it("asks for another tap when the chooser needs a fresh gesture after a failed reconnect", async () => {
    const f = fixture();
    f.server.connect = async () => {
      throw new Error("unreachable");
    };
    let calls = 0;
    const getDevices = vi.fn(async () => [f.device]);
    const radio: Radio = {
      async requestDevice(options) {
        calls++;
        if (calls === 1)
          throw Object.assign(new Error("Must be handling a user gesture"), {
            name: "SecurityError",
          });
        return f.radio.requestDevice(options);
      },
      getDevices,
    };
    const transport = createWebTransport(
      radio,
      memory({ id: "picked" }),
      quick,
    );
    await expect(transport.connect(observers())).rejects.toThrow(
      "Tap Connect scale to choose it",
    );
    f.server.connect = async () => {
      f.server.connected = true;
      return f.server;
    };
    await transport.connect(observers());
    expect(getDevices).toHaveBeenCalledOnce();
    expect(calls).toBe(2);
    expect(f.server.connected).toBe(true);
  });
  it("cancels while waiting for the remembered scale's advertisement", async () => {
    const f = fixture();
    Object.assign(f.device, { watchAdvertisements: async () => {} });
    const transport = createWebTransport(
      { ...f.radio, getDevices: async () => [f.device] },
      memory({ id: "picked" }),
      { advertisementMs: 60000, rememberedConnectMs: 60000 },
    );
    const pending = transport.connect(observers());
    await new Promise((resolve) => setTimeout(resolve, 0));
    transport.disconnect();
    await expect(pending).rejects.toThrow("cancelled");
    expect(f.server.connected).toBe(false);
    expect(f.options).toEqual([]);
  });
  it("connects when storage throws", async () => {
    const f = fixture();
    const broken: RememberedDevice = {
      load: () => {
        throw new Error("blocked");
      },
      save: () => {
        throw new Error("blocked");
      },
      clear: () => {
        throw new Error("blocked");
      },
    };
    await createWebTransport(
      { ...f.radio, getDevices: async () => [f.device] },
      broken,
      quick,
    ).connect(observers());
    expect(f.options).toEqual([filtered]);
    expect(f.server.connected).toBe(true);
  });
});
