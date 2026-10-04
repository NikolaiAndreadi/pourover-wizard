import { describe, expect, it } from "vitest";
import { createWakeLock, type Requester, type Sentinel } from "./wakeLock";

function fakePage(state: "visible" | "hidden" = "visible") {
  const listeners = new Set<() => void>();
  return {
    visibilityState: state as DocumentVisibilityState,
    addEventListener: (_type: string, listener: EventListener) => {
      listeners.add(listener as () => void);
    },
    removeEventListener: (_type: string, listener: EventListener) => {
      listeners.delete(listener as () => void);
    },
    listeners,
    show() {
      this.visibilityState = "visible";
      for (const listener of listeners) listener();
    },
    hide() {
      this.visibilityState = "hidden";
      for (const lock of this.locks) void lock.drop();
      for (const listener of listeners) listener();
    },
    locks: [] as ReturnType<typeof fakeSentinel>[],
  };
}
function fakeSentinel() {
  const onRelease = new Set<() => void>();
  const lock = {
    released: false,
    async release() {
      await this.drop();
    },
    async drop() {
      if (lock.released) return;
      lock.released = true;
      for (const listener of onRelease) listener();
    },
    addEventListener(_type: "release", listener: () => void) {
      onRelease.add(listener);
    },
  };
  return lock;
}
function fakeRequester(page: ReturnType<typeof fakePage>, fail = false) {
  let requests = 0;
  const requester: Requester = {
    wakeLock: {
      async request() {
        requests += 1;
        if (fail) throw new DOMException("low battery", "NotAllowedError");
        const lock = fakeSentinel();
        page.locks.push(lock);
        return lock as Sentinel;
      },
    },
  };
  return { requester, count: () => requests };
}
const held = (page: ReturnType<typeof fakePage>) =>
  page.locks.filter((lock) => !lock.released).length;

describe("screen wake lock", () => {
  it("holds one lock while wanted and releases it", async () => {
    const page = fakePage();
    const { requester, count } = fakeRequester(page);
    const lock = createWakeLock(
      () => requester,
      () => page,
    );
    await lock.hold();
    await lock.hold();
    expect(count()).toBe(1);
    expect(held(page)).toBe(1);
    await lock.release();
    await lock.release();
    expect(held(page)).toBe(0);
    expect(page.listeners.size).toBe(0);
  });
  it("takes the lock again after the page was hidden and shown", async () => {
    const page = fakePage();
    const { requester, count } = fakeRequester(page);
    const lock = createWakeLock(
      () => requester,
      () => page,
    );
    await lock.hold();
    page.hide();
    expect(held(page)).toBe(0);
    page.show();
    await Promise.resolve();
    expect(count()).toBe(2);
    expect(held(page)).toBe(1);
    await lock.release();
    page.show();
    await Promise.resolve();
    expect(count()).toBe(2);
    expect(held(page)).toBe(0);
  });
  it("waits for a hidden page before requesting", async () => {
    const page = fakePage("hidden");
    const { requester, count } = fakeRequester(page);
    const lock = createWakeLock(
      () => requester,
      () => page,
    );
    await lock.hold();
    expect(count()).toBe(0);
    page.show();
    await Promise.resolve();
    expect(held(page)).toBe(1);
    await lock.release();
  });
  it("releases a lock granted after release was asked for", async () => {
    const page = fakePage();
    const { requester } = fakeRequester(page);
    const lock = createWakeLock(
      () => requester,
      () => page,
    );
    const holding = lock.hold();
    await lock.release();
    await holding;
    expect(held(page)).toBe(0);
  });
  it("keeps the lock when held again while a release is pending", async () => {
    const page = fakePage();
    const { requester, count } = fakeRequester(page);
    const lock = createWakeLock(
      () => requester,
      () => page,
    );
    await Promise.all([lock.hold(), lock.release(), lock.hold()]);
    expect(count()).toBe(1);
    expect(held(page)).toBe(1);
    await lock.release();
    expect(held(page)).toBe(0);
    expect(page.listeners.size).toBe(0);
  });
  it("is a no-op without the API or when the browser refuses", async () => {
    const page = fakePage();
    const missing = createWakeLock(
      () => ({}),
      () => page,
    );
    await expect(missing.hold()).resolves.toBeUndefined();
    await expect(missing.release()).resolves.toBeUndefined();
    const refused = createWakeLock(
      () => fakeRequester(page, true).requester,
      () => page,
    );
    await expect(refused.hold()).resolves.toBeUndefined();
    expect(held(page)).toBe(0);
    await expect(refused.release()).resolves.toBeUndefined();
    const absent = createWakeLock(
      () => undefined,
      () => undefined,
    );
    await expect(absent.hold()).resolves.toBeUndefined();
    await expect(absent.release()).resolves.toBeUndefined();
  });
});
