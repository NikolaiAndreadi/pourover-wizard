export interface StoredBrew {
  recipeId?: string;
  /** Last valid dose in grams per recipe id. */
  doses: Record<string, number>;
}
export interface BrewMemory {
  load(): StoredBrew;
  saveRecipe(id: string): void;
  saveDose(recipeId: string, grams: number): void;
}
const KEY = "pourover-wizard.brew";
type Store = Pick<Storage, "getItem" | "setItem">;
/**
 * Remembers the chosen recipe and the last dose per recipe in browser
 * storage. Private windows, blocked storage, quota errors and corrupt values
 * all behave as "nothing remembered". Recipe ids are opaque here; the app
 * decides whether an id is known and whether a dose fits the recipe's range.
 */
export function createRememberedBrew(
  storage: () => Store | undefined = () => globalThis.localStorage,
): BrewMemory {
  const load = (): StoredBrew => {
    try {
      const raw = storage()?.getItem(KEY);
      if (!raw) return { doses: {} };
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "object" || value === null) return { doses: {} };
      const doses: Record<string, number> = {};
      if ("doses" in value && typeof value.doses === "object" && value.doses) {
        for (const [id, grams] of Object.entries(value.doses)) {
          if (typeof grams === "number" && Number.isFinite(grams) && grams > 0)
            doses[id] = grams;
        }
      }
      return "recipeId" in value &&
        typeof value.recipeId === "string" &&
        value.recipeId !== ""
        ? { recipeId: value.recipeId, doses }
        : { doses };
    } catch {
      return { doses: {} };
    }
  };
  const save = (value: StoredBrew) => {
    try {
      storage()?.setItem(KEY, JSON.stringify(value));
    } catch {
      // Not remembering the brew only means defaults are shown next time.
    }
  };
  return {
    load,
    saveRecipe(id) {
      save({ ...load(), recipeId: id });
    },
    saveDose(recipeId, grams) {
      const current = load();
      save({ ...current, doses: { ...current.doses, [recipeId]: grams } });
    },
  };
}
