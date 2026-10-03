import { describe, expect, it } from "vitest";
import { createRememberedDevice } from "./rememberedDevice";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
describe("remembered scale storage", () => {
  it("round-trips the last scale and forgets it", () => {
    const storage = memoryStorage();
    const remembered = createRememberedDevice(() => storage);
    expect(remembered.load()).toBeNull();
    remembered.save({ id: "abc", name: "BOOKOO_SC 000000" });
    expect(remembered.load()).toEqual({ id: "abc", name: "BOOKOO_SC 000000" });
    remembered.save({ id: "def" });
    expect(remembered.load()).toEqual({ id: "def" });
    remembered.clear();
    expect(remembered.load()).toBeNull();
    expect(storage.values.size).toBe(0);
  });
  it.each(["not json", "null", '{"name":"x"}', '{"id":""}', '{"id":4}'])(
    "treats a corrupt value %s as nothing remembered",
    (raw) => {
      const storage = memoryStorage();
      storage.values.set("pourover-wizard.scale", raw);
      expect(createRememberedDevice(() => storage).load()).toBeNull();
    },
  );
  it("ignores a non-string name", () => {
    const storage = memoryStorage();
    storage.values.set("pourover-wizard.scale", '{"id":"a","name":7}');
    expect(createRememberedDevice(() => storage).load()).toEqual({ id: "a" });
  });
  it("tolerates blocked, throwing or missing storage", () => {
    const fail = () => {
      throw new Error("SecurityError");
    };
    for (const storage of [
      fail,
      () => ({ getItem: fail, setItem: fail, removeItem: fail }),
      () => undefined,
    ]) {
      const remembered = createRememberedDevice(storage);
      expect(() => remembered.save({ id: "a" })).not.toThrow();
      expect(remembered.load()).toBeNull();
      expect(() => remembered.clear()).not.toThrow();
    }
  });
});
