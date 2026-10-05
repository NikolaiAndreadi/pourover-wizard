import { describe, expect, it } from "vitest";
import { createSoundAssistMemory } from "./soundAssist";

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
describe("sound assist storage", () => {
  it("defaults to off and round-trips on and off", () => {
    const storage = memoryStorage();
    const memory = createSoundAssistMemory(() => storage);
    expect(memory.load()).toBe(false);
    memory.save(true);
    expect(memory.load()).toBe(true);
    expect(storage.values.get("pourover-wizard.sound-assist")).toBe("on");
    memory.save(false);
    expect(memory.load()).toBe(false);
    expect(storage.values.size).toBe(0);
  });
  it("treats unknown values and blocked storage as off", () => {
    const storage = memoryStorage();
    storage.values.set("pourover-wizard.sound-assist", "yes");
    expect(createSoundAssistMemory(() => storage).load()).toBe(false);
    expect(createSoundAssistMemory(() => undefined).load()).toBe(false);
    expect(() =>
      createSoundAssistMemory(() => undefined).save(true),
    ).not.toThrow();
    const throwing = createSoundAssistMemory(() => {
      throw new Error("blocked");
    });
    expect(throwing.load()).toBe(false);
    expect(() => throwing.save(true)).not.toThrow();
  });
});
