import { expect, test } from "@playwright/test";
import { syntheticFrame } from "../src/scale/bookoo/synthetic.fixture";

declare global {
  interface Window {
    brewMock: {
      emit(bytes: number[]): void;
      drop(): void;
      failTare: boolean;
      writes: number[][];
      requests: number;
    };
    knownScale: {
      requests: number;
      lookups: number;
      hold(): void;
      release(): void;
    };
    allDevices: {
      requests: unknown[];
    };
  }
}
test("mocked live brewing uses the Mini profile, gates arming and stops on disconnection", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.addInitScript(() => {
    const characteristic = new EventTarget();
    const notify = Object.assign(characteristic, {
      value: new DataView(new ArrayBuffer(0)),
      properties: { write: true, writeWithoutResponse: false },
      async startNotifications() {
        return this;
      },
      async stopNotifications() {
        return this;
      },
      async writeValueWithResponse(bytes: Uint8Array) {
        if (window.brewMock.failTare) throw new Error("Tare write failed");
        window.brewMock.writes.push(Array.from(bytes));
      },
      async writeValueWithoutResponse() {},
    });
    const server = {
      connected: false,
      async connect() {
        this.connected = true;
        return this;
      },
      disconnect() {
        this.connected = false;
      },
      async getPrimaryService() {
        return {
          async getCharacteristic() {
            return notify;
          },
        };
      },
    };
    const device = Object.assign(new EventTarget(), {
      id: "mock-scale",
      name: "BOOKOO_SC 000000",
      gatt: server,
    });
    // Like stable Chrome without flags: no getDevices, so the chooser always opens.
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {
        async requestDevice() {
          window.brewMock.requests++;
          return device;
        },
      },
    });
    window.brewMock = {
      failTare: false,
      writes: [],
      requests: 0,
      emit(bytes) {
        notify.value = new DataView(Uint8Array.from(bytes).buffer);
        characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
      },
      drop() {
        server.connected = false;
        device.dispatchEvent(new Event("gattserverdisconnected"));
      },
    };
  });
  await page.goto("./");
  await page.getByLabel("Guide mode").selectOption("live");
  await expect(page.getByLabel("Grams unit code")).toHaveCount(0);
  await expect(page.getByLabel("Positive sign code")).toHaveCount(0);
  await expect(page.getByLabel("Negative sign code")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Get ready" }).click();
  await page.getByRole("button", { name: "Connect scale" }).click();
  await expect(page.getByRole("status")).toContainText("connected");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("pourover-wizard.scale")),
  ).toBe(JSON.stringify({ id: "mock-scale", name: "BOOKOO_SC 000000" }));
  await page.evaluate(() => {
    window.brewMock.failTare = true;
  });
  await page.getByRole("button", { name: "Tare", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Tare write failed");
  await expect(
    page.getByRole("button", { name: "Start when I pour" }),
  ).toBeDisabled();
  await page.evaluate(() => {
    window.brewMock.failTare = false;
  });
  await page.getByRole("button", { name: "Tare", exact: true }).click();
  const emit = async (grams: number) =>
    page.evaluate(
      (bytes) => window.brewMock.emit(bytes),
      Array.from(
        syntheticFrame({
          magnitude: Math.round(Math.abs(grams) * 100),
          unit: 1,
          sign: grams < 0 ? 0x2d : 0x2b,
        }),
      ),
    );
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(250);
    await emit(0);
  }
  // Duplicate receipts at the same monotonic instant must not pollute display smoothing.
  await page.evaluate(
    (bytes) => {
      window.brewMock.emit(bytes);
      window.brewMock.emit(bytes);
      window.brewMock.emit(bytes);
    },
    Array.from(syntheticFrame({ magnitude: 99900, unit: 1, sign: 0x2b })),
  );
  await expect(page.getByRole("status")).toContainText("0.0 g");
  await expect(
    page.getByRole("heading", { name: "Ready when you are" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Start when I pour" }).click();
  await page.evaluate(() => window.brewMock.drop());
  await expect(
    page.getByRole("dialog", { name: "scales disconnected!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ready when you are" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect scale" }).click();
  await page.clock.runFor(600);
  await expect(
    page.getByRole("heading", { name: "Ready when you are" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tare", exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(250);
    await emit(0);
  }
  await page.getByRole("button", { name: "Start when I pour" }).click();
  for (const grams of [0, 1.5, 3.2]) {
    await page.clock.runFor(250);
    await emit(grams);
  }
  await expect(
    page.getByRole("heading", { name: "Pour to 50 g" }),
  ).toBeVisible();
  await expect(page.getByTestId("pour-zoom")).toBeVisible();
  await expect(page.getByTestId("pour-zoom-expected")).toHaveCount(1);
  await expect(page.getByTestId("pour-zoom-actual")).toHaveCount(1);
  for (let i = 0; i < 4; i++) {
    await page.clock.runFor(250);
    await emit(250);
  }
  await page.evaluate(() => window.brewMock.drop());
  await expect(
    page.getByRole("dialog", { name: "scales disconnected!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Brew stopped" }),
  ).toBeVisible();
  const stoppedChart = await page.locator("svg").first().innerHTML();
  const stoppedSummary = await page.locator("main").innerText();
  await page.clock.runFor(2000);
  await emit(999);
  await page.clock.fastForward(130000);
  expect(await page.locator("svg").first().innerHTML()).toBe(stoppedChart);
  expect(await page.locator("main").innerText()).toBe(stoppedSummary);
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Prepare another brew" }).click();
  await page.getByRole("button", { name: "Get ready" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Connect scale" }).click();
  await page.getByRole("button", { name: "Pour now" }).click();
  await page.clock.runFor(1000);
  await expect(page.getByRole("timer")).toHaveText("0:01");
  for (let i = 0; i < 4; i++) {
    await page.clock.runFor(250);
    await emit(-12.2);
  }
  await expect(page.getByRole("status")).toContainText("0.0 g");
  await expect(page.getByTestId("pour-zoom")).toBeVisible();
  for (const grams of [10, 20, 30]) {
    await page.clock.runFor(250);
    await emit(grams);
  }
  await expect(page.getByTestId("pour-zoom-actual")).toHaveCount(1);
  await expect(page.getByTestId("pour-zoom-latest")).toBeVisible();
  await expect(page.locator(".brew-chart")).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("live-pour-zoom.png"),
    fullPage: true,
  });
  await page.clock.runFor(15000);
  await expect(
    page.getByRole("heading", { name: "Let it bloom", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("pour-zoom")).toHaveCount(0);
  await page.getByRole("button", { name: "Disconnect scale" }).click();
  await expect(
    page.getByRole("dialog", { name: "scales disconnected!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  expect(await page.evaluate(() => window.brewMock.writes)).toEqual([
    [3, 10, 1, 0, 0, 8],
    [3, 10, 1, 0, 0, 8],
  ]);
});

test("mocked live brewing reconnects to the remembered scale without the chooser and can forget it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const notify = Object.assign(new EventTarget(), {
      value: new DataView(new ArrayBuffer(0)),
      properties: { write: true, writeWithoutResponse: false },
      async startNotifications() {
        return this;
      },
      async stopNotifications() {
        return this;
      },
      async writeValueWithResponse() {},
      async writeValueWithoutResponse() {},
    });
    let gate: Promise<void> | null = null;
    let open = () => {};
    const server = {
      connected: false,
      async connect() {
        if (gate) await gate;
        this.connected = true;
        return this;
      },
      disconnect() {
        this.connected = false;
      },
      async getPrimaryService() {
        return {
          async getCharacteristic() {
            return notify;
          },
        };
      },
    };
    const device = Object.assign(new EventTarget(), {
      id: "mock-scale",
      name: "BOOKOO_SC 000000",
      gatt: server,
    });
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {
        async requestDevice() {
          window.knownScale.requests++;
          return device;
        },
        async getDevices() {
          window.knownScale.lookups++;
          return [device];
        },
      },
    });
    window.knownScale = {
      requests: 0,
      lookups: 0,
      hold() {
        gate = new Promise((resolve) => {
          open = resolve;
        });
      },
      release() {
        gate = null;
        open();
      },
    };
  });
  await page.goto("./");
  await page.getByLabel("Guide mode").selectOption("live");
  await page.getByRole("button", { name: "Get ready" }).click();
  await page.getByRole("button", { name: "Connect scale" }).click();
  await expect(page.getByRole("status")).toContainText(
    "BOOKOO Themis Mini connected",
  );
  expect(await page.evaluate(() => window.knownScale)).toMatchObject({
    requests: 1,
    lookups: 0,
  });
  await page.getByRole("button", { name: "Disconnect scale" }).click();
  await expect(page.getByRole("status")).toContainText("Scale disconnected");
  await page.evaluate(() => window.knownScale.hold());
  await page.getByRole("button", { name: "Connect scale" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Connecting to BOOKOO_SC 000000…",
  );
  await page.evaluate(() => window.knownScale.release());
  await expect(page.getByRole("status")).toContainText(
    "BOOKOO Themis Mini connected",
  );
  expect(await page.evaluate(() => window.knownScale)).toMatchObject({
    requests: 1,
    lookups: 1,
  });
  const setup = page.getByRole("complementary", { name: "Live scale setup" });
  await expect(setup).toContainText("Remembers BOOKOO_SC 000000.");
  await setup.getByRole("button", { name: "Forget scale" }).click();
  await expect(page.getByRole("button", { name: "Forget scale" })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() => localStorage.getItem("pourover-wizard.scale")),
  ).toBeNull();
});

test("a cancelled filtered chooser offers Show all devices, which requests every device and identifies the pick", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const notify = Object.assign(new EventTarget(), {
      value: new DataView(new ArrayBuffer(0)),
      properties: { write: true, writeWithoutResponse: false },
      async startNotifications() {
        return this;
      },
      async stopNotifications() {
        return this;
      },
      async writeValueWithResponse() {},
      async writeValueWithoutResponse() {},
    });
    const server = {
      connected: false,
      async connect() {
        this.connected = true;
        return this;
      },
      disconnect() {
        this.connected = false;
      },
      async getPrimaryService(uuid: string) {
        if (uuid !== "00000ffe-0000-1000-8000-00805f9b34fb")
          throw new DOMException("No Services matching UUID", "NotFoundError");
        return {
          async getCharacteristic() {
            return notify;
          },
        };
      },
    };
    const device = Object.assign(new EventTarget(), {
      id: "mock-scale",
      name: "Unnamed scale",
      gatt: server,
    });
    window.allDevices = { requests: [] };
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {
        async requestDevice(options: unknown) {
          window.allDevices.requests.push(options);
          // The filtered chooser finds nothing or is dismissed; Chrome reports NotFoundError.
          if (window.allDevices.requests.length === 1)
            throw new DOMException(
              "User cancelled the requestDevice() chooser.",
              "NotFoundError",
            );
          return device;
        },
      },
    });
  });
  await page.goto("./");
  await page.getByLabel("Guide mode").selectOption("live");
  await page.getByRole("button", { name: "Get ready" }).click();
  const setup = page.getByRole("complementary", { name: "Live scale setup" });
  await expect(setup).toContainText("BOOKOO Themis Mini · verified");
  await expect(setup).toContainText("BOOKOO Ultra Scale · untested");
  await expect(
    setup.getByRole("button", { name: "Show all devices" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Connect scale" }).click();
  await expect(page.getByRole("alert")).toContainText("User cancelled");
  await expect(page.getByRole("status")).toContainText("Scale disconnected");
  await setup.getByRole("button", { name: "Show all devices" }).click();
  await expect(page.getByRole("status")).toContainText(
    "BOOKOO Themis Mini connected",
  );
  await expect(
    setup.getByRole("button", { name: "Show all devices" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Devices in range" }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.allDevices.requests)).toEqual([
    {
      filters: [
        { services: ["00000ffe-0000-1000-8000-00805f9b34fb"] },
        { namePrefix: "BOOKOO_SC" },
      ],
      optionalServices: ["00000ffe-0000-1000-8000-00805f9b34fb"],
    },
    {
      acceptAllDevices: true,
      optionalServices: ["00000ffe-0000-1000-8000-00805f9b34fb"],
    },
  ]);
  expect(
    await page.evaluate(() => localStorage.getItem("pourover-wizard.scale")),
  ).toBe(JSON.stringify({ id: "mock-scale", name: "Unnamed scale" }));
});

test("live mode without Bluetooth remains a manual timer and never fabricates samples", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto("./");
  await page.getByLabel("Guide mode").selectOption("live");
  await page.getByRole("button", { name: "Get ready" }).click();
  await expect(
    page.getByRole("button", { name: "Connect scale" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Pour now" }).click();
  await page.clock.runFor(1000);
  await expect(page.getByRole("timer")).toHaveText("0:01");
  await expect(page.getByRole("status")).toContainText("Waiting for the scale");
  await expect(page.getByTestId("actual-series")).toHaveCount(0);
  await page.clock.fastForward(130000);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".brew-chart")).toBeVisible();
  await expect(page.getByTestId("stage-boundary")).toHaveCount(12);
  await expect(
    page.getByRole("term").filter({ hasText: "Water poured" }),
  ).toBeVisible();
  await expect(
    page.getByRole("definition").filter({ hasText: /^Not measured$/ }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Some scale readings are missing, so water poured may read low.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The scale wasn’t zeroed at the start, so water poured is unknown.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("definition").filter({ hasText: /^1:/ }),
  ).toHaveCount(0);
});
