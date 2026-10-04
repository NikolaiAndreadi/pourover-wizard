import { expect, type Page, test } from "@playwright/test";
import { syntheticFrame } from "../src/scale/bookoo/synthetic.fixture";

declare global {
  interface Window {
    pourZoomMock: { emit(bytes: number[]): void };
  }
}

const PLOT_HEIGHT = 160;
const PLOT_WIDTH = 400;

async function mockScale(page: Page) {
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
    window.pourZoomMock = {
      emit(bytes) {
        notify.value = new DataView(Uint8Array.from(bytes).buffer);
        characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
      },
    };
  });
}

function points(value: string | null): [number, number][] {
  return (value ?? "")
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x = Number.NaN, y = Number.NaN] = pair.split(",").map(Number);
      return [x, y];
    });
}

test("the pour zoom stays pinned to the pour's range when readings stray far outside it", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await mockScale(page);
  await page.goto("./");
  await page.getByLabel("Guide mode").selectOption("live");
  await page.getByRole("button", { name: "Get ready" }).click();
  await page.getByRole("button", { name: "Connect scale" }).click();
  await expect(page.getByRole("status")).toContainText("connected");
  await page.getByRole("button", { name: "Start now" }).click();

  const emit = async (grams: number) => {
    await page.clock.runFor(250);
    await page.evaluate(
      (bytes) => window.pourZoomMock.emit(bytes),
      Array.from(
        syntheticFrame({
          magnitude: Math.round(Math.abs(grams) * 100),
          unit: 1,
          sign: grams < 0 ? 0x2d : 0x2b,
        }),
      ),
    );
  };
  const zoom = page.getByTestId("pour-zoom");
  const expected = page.getByTestId("pour-zoom-expected");
  const latest = page.getByTestId("pour-zoom-latest");
  const expectPinnedRamp = async () => {
    const ramp = points(await expected.getAttribute("points"));
    expect(ramp).toHaveLength(2);
    const [[x1, y1], [x2, y2]] = ramp as [[number, number], [number, number]];
    // The ideal ramp runs from the lower-left to the upper-right of the plot.
    expect(y1 - y2).toBeGreaterThanOrEqual(PLOT_HEIGHT * 0.7);
    expect(x2 - x1).toBeGreaterThanOrEqual(PLOT_WIDTH * 0.9);
    expect(y1).toBeGreaterThan(PLOT_HEIGHT * 0.75);
    expect(y2).toBeLessThan(PLOT_HEIGHT * 0.25);
    for (const trace of await page.getByTestId("pour-zoom-actual").all())
      for (const [, y] of points(await trace.getAttribute("points"))) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(PLOT_HEIGHT);
      }
  };

  // Second pour: 0:45 to 1:00, 50 g to 100 g.
  await page.clock.runFor(45000);
  await expect(
    page.getByRole("heading", { name: "Pour to 100 g", exact: true }),
  ).toBeVisible();
  for (const grams of [52, -3, 58, 400, 64, 70]) await emit(grams);
  await expect(zoom).toContainText("0:45 · 50 g");
  await expect(zoom).toContainText("1:00 · 100 g");
  await expect(
    page.getByRole("img", {
      name: "This pour: ideal ramp to 100 g and your measured weight",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("pour-zoom-actual")).toHaveCount(1);
  await expect(latest).toBeVisible();
  await expect(latest).not.toHaveClass(/is-clipped/);
  await expectPinnedRamp();
  await emit(400);
  await expect(latest).toHaveClass(/is-clipped/);
  expect(Number.parseFloat(await latest.evaluate((dot) => dot.style.top))).toBe(
    0,
  );
  await expectPinnedRamp();

  // Last pour: 1:50 to 2:00, 200 g to 250 g, with an outlier from a bump.
  await page.clock.runFor(110000 - 46750);
  await expect(
    page.getByRole("heading", { name: "Pour to 250 g", exact: true }),
  ).toBeVisible();
  for (const grams of [201, 205, -3, 211, 216, 400, 222, 228, 233])
    await emit(grams);
  await expect(zoom).toContainText("1:50 · 200 g");
  await expect(zoom).toContainText("2:00 · 250 g");
  await expect(page.getByTestId("pour-zoom-actual")).toHaveCount(1);
  await expectPinnedRamp();
  await zoom.screenshot({
    path: `reports/screens/pour-zoom-last-pour-${test.info().project.name}.png`,
  });
});
