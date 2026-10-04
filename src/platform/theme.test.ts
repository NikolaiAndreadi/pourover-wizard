import { describe, expect, it } from "vitest";
import { createThemeMemory } from "./theme";

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
describe("theme storage", () => {
  it("defaults to system and round-trips light and dark", () => {
    const storage = memoryStorage();
    const memory = createThemeMemory(() => storage);
    expect(memory.load()).toBe("system");
    memory.save("dark");
    expect(memory.load()).toBe("dark");
    memory.save("light");
    expect(memory.load()).toBe("light");
    memory.save("system");
    expect(memory.load()).toBe("system");
    expect(storage.values.size).toBe(0);
  });
  it("treats unknown values and blocked storage as system", () => {
    const storage = memoryStorage();
    storage.values.set("pourover-wizard.theme", "sepia");
    expect(createThemeMemory(() => storage).load()).toBe("system");
    expect(createThemeMemory(() => undefined).load()).toBe("system");
    expect(() => createThemeMemory(() => undefined).save("dark")).not.toThrow();
    const throwing = createThemeMemory(() => {
      throw new Error("blocked");
    });
    expect(throwing.load()).toBe("system");
    expect(() => throwing.save("dark")).not.toThrow();
  });
});
