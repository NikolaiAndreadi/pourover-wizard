// Structurally matches the scale layer's RememberedDevice contract; platform
// code depends only on core and itself.
export interface StoredScale {
  id: string;
  name?: string;
}
export interface ScaleMemory {
  load(): StoredScale | null;
  save(value: StoredScale): void;
  clear(): void;
}
const KEY = "pourover-wizard.scale";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/**
 * Remembers the last chosen scale in browser storage. Private windows, blocked
 * storage, quota errors and corrupt values all behave as "nothing remembered".
 */
export function createRememberedDevice(
  storage: () => Store | undefined = () => globalThis.localStorage,
): ScaleMemory {
  return {
    load(): StoredScale | null {
      try {
        const raw = storage()?.getItem(KEY);
        if (!raw) return null;
        const value: unknown = JSON.parse(raw);
        if (
          typeof value !== "object" ||
          value === null ||
          !("id" in value) ||
          typeof value.id !== "string" ||
          value.id === ""
        )
          return null;
        return "name" in value && typeof value.name === "string"
          ? { id: value.id, name: value.name }
          : { id: value.id };
      } catch {
        return null;
      }
    },
    save(value) {
      try {
        storage()?.setItem(
          KEY,
          JSON.stringify(
            value.name === undefined
              ? { id: value.id }
              : { id: value.id, name: value.name },
          ),
        );
      } catch {
        // Not remembering the scale only means the chooser opens next time.
      }
    },
    clear() {
      try {
        storage()?.removeItem(KEY);
      } catch {
        // Nothing else to clear.
      }
    },
  };
}
