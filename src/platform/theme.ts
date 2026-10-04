export type ThemePreference = "system" | "light" | "dark";
export interface ThemeMemory {
  load(): ThemePreference;
  save(value: ThemePreference): void;
}
const KEY = "pourover-wizard.theme";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function createThemeMemory(
  storage: () => Store | undefined = () => globalThis.localStorage,
): ThemeMemory {
  return {
    load() {
      try {
        const raw = storage()?.getItem(KEY);
        return raw === "light" || raw === "dark" ? raw : "system";
      } catch {
        return "system";
      }
    },
    save(value) {
      try {
        if (value === "system") storage()?.removeItem(KEY);
        else storage()?.setItem(KEY, value);
      } catch {}
    },
  };
}
