import { describe, expect, it, vi } from "vitest";
import { bookooUuids } from "@/scale/bookoo/codec";
import type { RememberedDevice, RememberedScale } from "@/scale/contracts";
import { createNativeTransport, type NativeRadio } from "./native";

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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(
  write = true,
  withoutResponse = false,
  remembered?: RememberedDevice,
) {
  let lost: (() => void) | undefined;
  let chunk: ((value: DataView) => void) | undefined;
  const properties = {
    broadcast: false,
    read: false,
    writeWithoutResponse: false,
    write: false,
    notify: false,
    indicate: false,
    authenticatedSignedWrites: false,
  };
  const radio: NativeRadio = {
    initialize: vi.fn(async () => {}),
    requestDevice: vi.fn(async () => ({
      deviceId: "scale",
      name: "BOOKOO_SC 000000",
    })),
    requestLEScan: vi.fn(async () => {}),
    stopLEScan: vi.fn(async () => {}),
    getDevices: vi.fn(async () => []),
    connect: vi.fn(async (id, callback) => {
      lost = callback && (() => callback(id));
    }),
    disconnect: vi.fn(async () => {}),
    getServices: vi.fn(async () => [
      {
        uuid: bookooUuids.service,
        characteristics: [
          {
            uuid: bookooUuids.notify,
            properties: { ...properties, notify: true },
            descriptors: [],
          },
          {
            uuid: bookooUuids.command,
            properties: {
              ...properties,
              write,
              writeWithoutResponse: withoutResponse,
            },
            descriptors: [],
          },
        ],
      },
    ]),
    startNotifications: vi.fn(async (_id, _service, _notify, callback) => {
      chunk = callback;
    }),
    stopNotifications: vi.fn(async () => {}),
    write: vi.fn(async () => {}),
    writeWithoutResponse: vi.fn(async () => {}),
  };
  const observers = { onChunk: vi.fn(), onDisconnect: vi.fn() };
  return {
    radio,
    observers,
    transport: createNativeTransport(radio, remembered),
    notify: (value: DataView) => chunk?.(value),
    lose: () => lost?.(),
  };
}
describe("native scale transport", () => {
  it("waits for a different adapter's teardown before reconnecting the shared radio", async () => {
    const f = fixture();
    await f.transport.connect(f.observers);
    const gate = deferred();
    const entered = deferred();
    vi.mocked(f.radio.stopNotifications).mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
    });
    f.transport.disconnect();
    await entered.promise;
    const replacement = createNativeTransport(f.radio);
    const pending = replacement.connect(f.observers);
    await Promise.resolve();
    expect(f.radio.connect).toHaveBeenCalledTimes(1);
    gate.resolve();
    await pending;
    expect(f.radio.connect).toHaveBeenCalledTimes(2);
    const disconnectOrder = vi.mocked(f.radio.disconnect).mock
      .invocationCallOrder[0]!;
    const connectOrder = vi.mocked(f.radio.connect).mock
      .invocationCallOrder[1]!;
    expect(disconnectOrder).toBeLessThan(connectOrder);
    await replacement.write(new Uint8Array([1]));
    expect(f.radio.write).toHaveBeenCalledOnce();
  });
  it("copies only notification view bytes and ignores stale callbacks after disconnect", async () => {
    const f = fixture();
    await f.transport.connect(f.observers);
    const bytes = new Uint8Array([9, 1, 2, 8]);
    f.notify(new DataView(bytes.buffer, 1, 2));
    bytes[1] = 99;
    expect(f.observers.onChunk).toHaveBeenCalledWith(new Uint8Array([1, 2]));
    f.transport.disconnect();
    f.notify(new DataView(bytes.buffer));
    f.lose();
    await expect(f.transport.write(bytes)).rejects.toThrow("disconnected");
    expect(f.observers.onChunk).toHaveBeenCalledTimes(1);
    expect(f.observers.onDisconnect).not.toHaveBeenCalled();
    expect(f.radio.stopNotifications).toHaveBeenCalledTimes(1);
    expect(f.radio.disconnect).toHaveBeenCalledTimes(1);
  });
  it.each([
    [true, true],
    [false, true],
  ])(
    "selects supported write mode (%s/%s) and snapshots bytes",
    async (write, without) => {
      const f = fixture(write, without);
      await f.transport.connect(f.observers);
      const bytes = new Uint8Array([3, 10]);
      const pending = f.transport.write(bytes);
      bytes[0] = 99;
      await pending;
      const chosen = write ? f.radio.write : f.radio.writeWithoutResponse;
      expect(chosen).toHaveBeenCalledWith(
        "scale",
        bookooUuids.service,
        bookooUuids.command,
        expect.any(DataView),
      );
      expect(
        Array.from(new Uint8Array(vi.mocked(chosen).mock.calls[0]![3].buffer)),
      ).toEqual([3, 10]);
      expect(
        write ? f.radio.writeWithoutResponse : f.radio.write,
      ).not.toHaveBeenCalled();
    },
  );
  it("rejects unsupported command properties and releases the connection", async () => {
    const f = fixture(false, false);
    await expect(f.transport.connect(f.observers)).rejects.toThrow(
      "not writable",
    );
    expect(f.radio.disconnect).toHaveBeenCalledOnce();
    expect(f.radio.startNotifications).not.toHaveBeenCalled();
  });
  it("cancels chooser completion before connecting", async () => {
    const f = fixture();
    const gate = deferred();
    const opened = deferred();
    vi.mocked(f.radio.requestDevice).mockImplementation(async () => {
      opened.resolve();
      await gate.promise;
      return { deviceId: "scale" };
    });
    const pending = f.transport.connect(f.observers);
    await opened.promise;
    f.transport.disconnect();
    const rejected = expect(pending).rejects.toThrow("cancelled");
    gate.resolve();
    await rejected;
    expect(f.radio.connect).not.toHaveBeenCalled();
  });
  it.each(["connect", "startNotifications"] as const)(
    "serializes reconnect after cancellation during %s",
    async (method) => {
      const f = fixture();
      const gate = deferred();
      const entered = deferred();
      vi.mocked(f.radio[method]).mockImplementationOnce(async () => {
        entered.resolve();
        await gate.promise;
      });
      const pending = f.transport.connect(f.observers);
      await entered.promise;
      f.transport.disconnect();
      const next = f.transport.connect(f.observers);
      const rejected = expect(pending).rejects.toThrow("cancelled");
      gate.resolve();
      await rejected;
      await next;
      expect(f.radio.disconnect).toHaveBeenCalledTimes(1);
      await f.transport.write(new Uint8Array([1]));
      expect(f.radio.write).toHaveBeenCalledOnce();
    },
  );
  it("cleans a partial notification failure and permits retry", async () => {
    const f = fixture();
    vi.mocked(f.radio.startNotifications).mockRejectedValueOnce(
      new Error("subscription failed"),
    );
    await expect(f.transport.connect(f.observers)).rejects.toThrow(
      "subscription failed",
    );
    expect(f.radio.stopNotifications).toHaveBeenCalledOnce();
    expect(f.radio.disconnect).toHaveBeenCalledOnce();
    await f.transport.connect(f.observers);
  });
  it("reports loss once and rejects writes that finish after loss", async () => {
    const f = fixture();
    await f.transport.connect(f.observers);
    const gate = deferred();
    const entered = deferred();
    vi.mocked(f.radio.write).mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
    });
    const pending = f.transport.write(new Uint8Array([1]));
    await entered.promise;
    f.lose();
    f.lose();
    const rejected = expect(pending).rejects.toThrow("cancelled");
    gate.resolve();
    await rejected;
    expect(f.observers.onDisconnect).toHaveBeenCalledOnce();
    await expect(f.transport.write(new Uint8Array([1]))).rejects.toThrow(
      "disconnected",
    );
  });
});
describe("native scale chooser and remembered scale", () => {
  it("filters the chooser by the BOOKOO name prefix and remembers the pick", async () => {
    const saved = memory();
    const f = fixture(true, false, saved);
    const steps: unknown[] = [];
    await f.transport.connect({
      ...f.observers,
      onProgress: (step) => steps.push(step),
    });
    expect(f.radio.requestDevice).toHaveBeenCalledWith({
      namePrefix: "BOOKOO_SC",
      optionalServices: [bookooUuids.service],
    });
    expect(f.radio.getDevices).not.toHaveBeenCalled();
    expect(saved.save).toHaveBeenCalledWith({
      id: "scale",
      name: "BOOKOO_SC 000000",
    });
    expect(steps).toEqual([
      { kind: "chooser" },
      { kind: "device", name: "BOOKOO_SC 000000" },
    ]);
  });
  it("connects to the remembered scale by id without the chooser", async () => {
    const saved = memory({ id: "known", name: "BOOKOO_SC 000000" });
    const f = fixture(true, false, saved);
    vi.mocked(f.radio.getDevices).mockResolvedValue([{ deviceId: "known" }]);
    const steps: unknown[] = [];
    await f.transport.connect({
      ...f.observers,
      onProgress: (step) => steps.push(step),
    });
    expect(f.radio.getDevices).toHaveBeenCalledWith(["known"]);
    expect(f.radio.requestDevice).not.toHaveBeenCalled();
    expect(f.radio.connect).toHaveBeenCalledWith(
      "known",
      expect.any(Function),
      { timeout: 5000 },
    );
    expect(steps).toEqual([{ kind: "device", name: "BOOKOO_SC 000000" }]);
    await f.transport.write(new Uint8Array([1]));
    expect(f.radio.write).toHaveBeenCalledWith(
      "known",
      bookooUuids.service,
      bookooUuids.command,
      expect.any(DataView),
    );
    f.lose();
    expect(f.observers.onDisconnect).toHaveBeenCalledOnce();
  });
  it.each([
    ["is not retrievable", (radio: NativeRadio) => radio],
    [
      "lookup fails",
      (radio: NativeRadio) => {
        vi.mocked(radio.getDevices).mockRejectedValue(new Error("lookup"));
        return radio;
      },
    ],
    [
      "connection times out",
      (radio: NativeRadio) => {
        vi.mocked(radio.getDevices).mockResolvedValue([{ deviceId: "known" }]);
        vi.mocked(radio.connect).mockRejectedValueOnce(
          new Error("Connection timeout."),
        );
        return radio;
      },
    ],
  ])(
    "falls back to the chooser when the remembered scale %s and overwrites it",
    async (_case, arrange) => {
      const saved = memory({ id: "known" });
      const f = fixture(true, false, saved);
      arrange(f.radio);
      await f.transport.connect(f.observers);
      expect(f.radio.requestDevice).toHaveBeenCalledOnce();
      expect(saved.save).toHaveBeenCalledWith({
        id: "scale",
        name: "BOOKOO_SC 000000",
      });
      await f.transport.write(new Uint8Array([1]));
      expect(f.radio.write).toHaveBeenCalledWith(
        "scale",
        bookooUuids.service,
        bookooUuids.command,
        expect.any(DataView),
      );
    },
  );
  it("connects even when storage throws", async () => {
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
    const f = fixture(true, false, broken);
    await f.transport.connect(f.observers);
    expect(f.radio.requestDevice).toHaveBeenCalledOnce();
    await f.transport.write(new Uint8Array([1]));
    expect(f.radio.write).toHaveBeenCalledOnce();
  });
  it("cancels while reaching the remembered scale without opening the chooser", async () => {
    const saved = memory({ id: "known" });
    const f = fixture(true, false, saved);
    const gate = deferred();
    const entered = deferred();
    vi.mocked(f.radio.getDevices).mockImplementation(async () => {
      entered.resolve();
      await gate.promise;
      return [{ deviceId: "known" }];
    });
    const pending = f.transport.connect(f.observers);
    await entered.promise;
    f.transport.disconnect();
    const rejected = expect(pending).rejects.toThrow("cancelled");
    gate.resolve();
    await rejected;
    expect(f.radio.connect).not.toHaveBeenCalled();
    expect(f.radio.requestDevice).not.toHaveBeenCalled();
  });
});
describe("native in-app scan (mocked plugin; iOS behavior is unverified)", () => {
  type Result = Parameters<Parameters<NativeRadio["requestLEScan"]>[1]>[0];
  function scanning(remembered?: RememberedDevice) {
    let emit: ((result: Result) => void) | undefined;
    const started = deferred();
    const f = fixture(true, false, remembered);
    vi.mocked(f.radio.requestLEScan).mockImplementation(
      async (_options, callback) => {
        emit = callback;
        started.resolve();
      },
    );
    const lists: unknown[] = [];
    return {
      ...f,
      transport: createNativeTransport(f.radio, remembered, { scanMs: 30 }),
      lists,
      started: started.promise,
      emit: (result: Result) => emit?.(result),
      onCandidates: (list: unknown) => lists.push(list),
    };
  }
  it("collects devices by id with the latest signal, sorted strongest first, and stops after the bound", async () => {
    const s = scanning();
    const pending = s.transport.scan!.start({
      onCandidates: s.onCandidates,
    });
    await s.started;
    expect(s.radio.requestLEScan).toHaveBeenCalledWith(
      { allowDuplicates: true },
      expect.any(Function),
    );
    s.emit({ device: { deviceId: "far", name: "Kettle" }, rssi: -80 });
    s.emit({
      device: { deviceId: "near" },
      localName: "BOOKOO_SC 1",
      rssi: -60,
    });
    s.emit({ device: { deviceId: "far", name: "Kettle" }, rssi: -50 });
    s.emit({ device: { deviceId: "quiet" } });
    await pending;
    expect(s.lists).toEqual([
      [{ id: "far", name: "Kettle", rssi: -80 }],
      [
        { id: "near", name: "BOOKOO_SC 1", rssi: -60 },
        { id: "far", name: "Kettle", rssi: -80 },
      ],
      [
        { id: "far", name: "Kettle", rssi: -50 },
        { id: "near", name: "BOOKOO_SC 1", rssi: -60 },
      ],
      [
        { id: "far", name: "Kettle", rssi: -50 },
        { id: "near", name: "BOOKOO_SC 1", rssi: -60 },
        { id: "quiet" },
      ],
    ]);
    expect(s.radio.stopLEScan).toHaveBeenCalledOnce();
    expect(s.radio.connect).not.toHaveBeenCalled();
    // Late results after the bound change nothing.
    s.emit({ device: { deviceId: "late" }, rssi: -10 });
    expect(s.lists).toHaveLength(4);
  });
  it("stops a pending scan on disconnect and rejects it as cancelled", async () => {
    const s = scanning();
    s.transport = createNativeTransport(s.radio, undefined, { scanMs: 60000 });
    const pending = s.transport.scan!.start({ onCandidates: s.onCandidates });
    await s.started;
    s.transport.disconnect();
    await expect(pending).rejects.toThrow("cancelled");
    expect(s.radio.stopLEScan).toHaveBeenCalledOnce();
    s.emit({ device: { deviceId: "late" }, rssi: -10 });
    expect(s.lists).toEqual([]);
  });
  it("lets a filtered connect supersede a scan and waits for the scan to stop first", async () => {
    const s = scanning();
    s.transport = createNativeTransport(s.radio, undefined, { scanMs: 60000 });
    const pending = s.transport.scan!.start({ onCandidates: s.onCandidates });
    await s.started;
    const next = s.transport.connect(s.observers);
    await expect(pending).rejects.toThrow("cancelled");
    await next;
    const stopOrder = vi.mocked(s.radio.stopLEScan).mock
      .invocationCallOrder[0]!;
    const requestOrder = vi.mocked(s.radio.requestDevice).mock
      .invocationCallOrder[0]!;
    expect(stopOrder).toBeLessThan(requestOrder);
  });
  it("surfaces a scan that cannot start and still stops scanning", async () => {
    const s = scanning();
    vi.mocked(s.radio.requestLEScan).mockRejectedValue(
      new Error("Bluetooth is off"),
    );
    await expect(
      s.transport.scan!.start({ onCandidates: s.onCandidates }),
    ).rejects.toThrow("Bluetooth is off");
    expect(s.radio.stopLEScan).toHaveBeenCalledOnce();
  });
  it("connects a picked candidate, identifies it by services and remembers it", async () => {
    const saved = memory();
    const s = scanning(saved);
    const steps: unknown[] = [];
    const identified: string[] = [];
    await s.transport.scan!.connect(
      { id: "near", name: "BOOKOO_SC 1", rssi: -60 },
      {
        ...s.observers,
        onProgress: (step) => steps.push(step),
        onIdentified: (model) => identified.push(model.id),
      },
    );
    expect(s.radio.requestDevice).not.toHaveBeenCalled();
    expect(s.radio.connect).toHaveBeenCalledWith(
      "near",
      expect.any(Function),
      undefined,
    );
    expect(steps).toEqual([{ kind: "device", name: "BOOKOO_SC 1" }]);
    expect(identified).toEqual(["bookoo-themis-mini"]);
    expect(saved.save).toHaveBeenCalledWith({
      id: "near",
      name: "BOOKOO_SC 1",
    });
    await s.transport.write(new Uint8Array([1]));
    expect(s.radio.write).toHaveBeenCalledWith(
      "near",
      bookooUuids.service,
      bookooUuids.command,
      expect.any(DataView),
    );
  });
  it("releases a picked device that exposes no supported service", async () => {
    const s = scanning();
    vi.mocked(s.radio.getServices).mockResolvedValue([
      { uuid: "0000180a-0000-1000-8000-00805f9b34fb", characteristics: [] },
    ]);
    await expect(
      s.transport.scan!.connect({ id: "kettle" }, s.observers),
    ).rejects.toThrow("not a supported scale");
    expect(s.radio.disconnect).toHaveBeenCalledWith("kettle");
    expect(s.radio.startNotifications).not.toHaveBeenCalled();
    expect(s.radio.stopNotifications).not.toHaveBeenCalled();
  });
  it("identifies short-form service UUIDs reported by the plugin", async () => {
    const s = scanning();
    const original = await s.radio.getServices("scale");
    vi.mocked(s.radio.getServices).mockResolvedValue([
      {
        uuid: "0FFE",
        characteristics: original[0]!.characteristics.map((value) => ({
          ...value,
          uuid: value.uuid.slice(4, 8).toUpperCase(),
        })),
      },
    ]);
    const identified: string[] = [];
    await s.transport.connect({
      ...s.observers,
      onIdentified: (model) => identified.push(model.id),
    });
    expect(identified).toEqual(["bookoo-themis-mini"]);
    expect(s.radio.startNotifications).toHaveBeenCalledWith(
      "scale",
      bookooUuids.service,
      bookooUuids.notify,
      expect.any(Function),
    );
  });
  it("opens the plugin chooser without filters for connectAll", async () => {
    const s = scanning();
    await s.transport.connectAll(s.observers);
    expect(s.radio.requestDevice).toHaveBeenCalledWith({
      optionalServices: [bookooUuids.service],
    });
    expect(s.radio.requestLEScan).not.toHaveBeenCalled();
  });
});
