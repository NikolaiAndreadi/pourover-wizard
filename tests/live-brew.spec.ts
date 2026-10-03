import { expect, test } from "@playwright/test";
import { syntheticFrame } from "../src/scale/bookoo/synthetic.fixture";

declare global {
  interface Window {
    brewMock: {
      emit(bytes: number[]): void;
      drop(): void;
      failTare: boolean;
      writes: number[][];
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
    const device = Object.assign(new EventTarget(), { gatt: server });
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {
        async requestDevice() {
          return device;
        },
      },
    });
    window.brewMock = {
      failTare: false,
      writes: [],
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
  await page.getByRole("button", { name: "Prepare brew" }).click();
  await page.getByRole("button", { name: "Connect BOOKOO scale" }).click();
  await expect(page.getByRole("status")).toContainText("connected");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => {
    window.brewMock.failTare = true;
  });
  await page.getByRole("button", { name: "Tare live scale" }).click();
  await expect(page.getByRole("alert")).toHaveText("Tare write failed");
  await expect(
    page.getByRole("button", { name: "Arm auto-start" }),
  ).toBeDisabled();
  await page.evaluate(() => {
    window.brewMock.failTare = false;
  });
  await page.getByRole("button", { name: "Tare live scale" }).click();
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
  await page.getByRole("button", { name: "Arm auto-start" }).click();
  await page.evaluate(() => window.brewMock.drop());
  await expect(
    page.getByRole("dialog", { name: "scales disconnected!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ready when you are" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect BOOKOO scale" }).click();
  await page.clock.runFor(600);
  await expect(
    page.getByRole("heading", { name: "Ready when you are" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tare live scale" }).click();
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(250);
    await emit(0);
  }
  await page.getByRole("button", { name: "Arm auto-start" }).click();
  for (const grams of [0, 1.5, 3.2]) {
    await page.clock.runFor(250);
    await emit(grams);
  }
  await expect(
    page.getByRole("heading", { name: "Bloom · pour gently" }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "Prepare brew" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Connect BOOKOO scale" }).click();
  await page.getByRole("button", { name: "Pour now" }).click();
  await page.clock.runFor(1000);
  await expect(page.getByRole("timer")).toHaveText("0:01");
  for (let i = 0; i < 4; i++) {
    await page.clock.runFor(250);
    await emit(-12.2);
  }
  await expect(page.getByRole("status")).toContainText("0.0 g");
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
  await page.getByRole("button", { name: "Prepare brew" }).click();
  await expect(
    page.getByRole("button", { name: "Connect BOOKOO scale" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Pour now" }).click();
  await page.clock.runFor(1000);
  await expect(page.getByRole("timer")).toHaveText("0:01");
  await expect(page.getByRole("status")).toContainText(
    "Waiting for fresh readings",
  );
  await expect(page.getByTestId("actual-series")).toHaveCount(0);
  await page.clock.fastForward(130000);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByText("Measured settled water estimate: unavailable", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Readings are missing from part of this brew.", {
      exact: false,
    }),
  ).toBeVisible();
});
