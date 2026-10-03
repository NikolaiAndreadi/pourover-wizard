import { describe, expect, it } from "vitest";
import { bookooUuids } from "@/scale/bookoo/codec";
import { createWebTransport, type Radio } from "@/scale/transport/web";

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
  const device = Object.assign(new EventTarget(), { gatt: server });
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
  it("requests only explicit service access, preserves view bounds, writes commands, and tears down once", async () => {
    const f = fixture();
    const transport = createWebTransport(bookooUuids, f.radio);
    const chunks: Uint8Array[] = [];
    let lost = 0;
    await transport.connect({
      onChunk: (bytes) => chunks.push(bytes),
      onDisconnect: () => lost++,
    });
    expect(f.options).toEqual([
      { acceptAllDevices: true, optionalServices: [bookooUuids.service] },
    ]);
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
    const transport = createWebTransport(bookooUuids, f.radio);
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
    const transport = createWebTransport(bookooUuids, f.radio);
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
  it("cancels an open chooser without connecting and rejects invalid service selection", async () => {
    const f = fixture();
    let choose: (device: typeof f.device) => void = () => {};
    const transport = createWebTransport(bookooUuids, {
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
    expect(() =>
      createWebTransport({ ...bookooUuids, service: "bad" }, f.radio),
    ).toThrow("UUID");
  });
});
