export interface SoundAssistMemory {
  load(): boolean;
  save(on: boolean): void;
}
const KEY = "pourover-wizard.sound-assist";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function createSoundAssistMemory(
  storage: () => Store | undefined = () => globalThis.localStorage,
): SoundAssistMemory {
  return {
    load() {
      try {
        return storage()?.getItem(KEY) === "on";
      } catch {
        return false;
      }
    },
    save(on) {
      try {
        if (on) storage()?.setItem(KEY, "on");
        else storage()?.removeItem(KEY);
      } catch {}
    },
  };
}
