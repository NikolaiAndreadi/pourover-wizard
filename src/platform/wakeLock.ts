export interface WakeLock {
  hold(): Promise<void>;
  release(): Promise<void>;
}
export interface Sentinel {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}
export interface Requester {
  wakeLock?: { request(type: "screen"): Promise<Sentinel> };
}
type Page = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;
/**
 * The Screen Wake Lock behind a hold/release pair. The browser drops the
 * lock itself whenever the page is hidden, so a hold that is still wanted
 * is requested again once the page is visible. Browsers without the API,
 * low-battery refusals and other errors all behave as "not held".
 */
export function createWakeLock(
  requester: () => Requester | undefined = () => globalThis.navigator,
  page: () => Page | undefined = () => globalThis.document,
): WakeLock {
  let wanted = false;
  let sentinel: Sentinel | null = null;
  let pending: Promise<void> | null = null;
  const request = async () => {
    if (!wanted || sentinel || page()?.visibilityState === "hidden") return;
    try {
      const lock = await requester()?.wakeLock?.request("screen");
      if (!lock) return;
      if (!wanted) {
        await lock.release();
        return;
      }
      sentinel = lock;
      lock.addEventListener("release", () => {
        if (sentinel === lock) sentinel = null;
      });
    } catch {}
  };
  const requestOnce = () => {
    if (!pending)
      pending = request().finally(() => {
        pending = null;
      });
    return pending;
  };
  const visible = () => {
    if (page()?.visibilityState === "visible") void requestOnce();
  };
  return {
    async hold() {
      if (wanted) return;
      wanted = true;
      page()?.addEventListener("visibilitychange", visible);
      await requestOnce();
    },
    async release() {
      if (!wanted) return;
      wanted = false;
      page()?.removeEventListener("visibilitychange", visible);
      await pending;
      const lock = sentinel;
      sentinel = null;
      if (!lock || lock.released) return;
      try {
        await lock.release();
      } catch {}
    },
  };
}
