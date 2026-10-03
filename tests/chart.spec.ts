import { expect, test } from "@playwright/test";

test("live brewing uses the compact strip, zooms into pours, and the summary shows the full chart", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.goto("./");
  await page.getByLabel("Guide mode").selectOption("live");
  await page.getByRole("button", { name: "Get ready" }).click();
  await expect(page.getByTestId("progress-strip")).toBeVisible();
  await expect(page.locator(".brew-chart")).toHaveCount(0);
  await expect(page.getByTestId("pour-zoom")).toHaveCount(0);
  await page.getByRole("button", { name: "Pour now" }).click();
  await expect(page.getByTestId("progress-strip")).toBeVisible();
  await expect(page.locator(".brew-chart")).toHaveCount(0);
  await expect(page.getByTestId("progress-boundary")).toHaveCount(12);
  const zoom = page.getByTestId("pour-zoom");
  await expect(zoom).toBeVisible();
  await expect(page.getByTestId("pour-zoom-expected")).toHaveCount(1);
  await expect(page.getByTestId("pour-zoom-actual")).toHaveCount(0);
  await expect(zoom).toContainText("0:00 · 0 g");
  await expect(zoom).toContainText("0:10 · 50 g");
  await page.clock.runFor(74000);
  await expect(
    page.getByRole("heading", { name: "Pour to 150 g", exact: true }),
  ).toBeVisible();
  await expect(zoom).toContainText("1:10 · 100 g");
  await expect(zoom).toContainText("1:20 · 150 g");
  await expect(page.locator(".step-current")).toContainText("Pour to 150 g");
  await expect(page.locator(".step-next")).toContainText("Wait");
  await expect(page.locator(".step-current")).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.screenshot({
    path: info.outputPath("live-strip-74s.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.clock.runFor(2000);
  await expect(page.locator(".step-next")).toContainText("0:04");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".step-context")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await page.clock.runFor(4000);
  await expect(
    page.getByRole("heading", { name: "Wait", exact: true }),
  ).toBeVisible();
  await expect(zoom).toHaveCount(0);
  await expect(page.locator(".step-next")).toContainText("Pour to 200 g");
  await expect(
    page.locator(".step-next .action-scene.is-still"),
  ).toHaveAttribute("data-scene", "pour");
  await expect(page.locator(".step-next .scene-reel")).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Brew steps" }).getByRole("listitem"),
  ).toHaveCount(2);
  await page.clock.runFor(121000);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const chart = page.locator(".brew-chart");
  await expect(chart).toBeVisible();
  await expect(chart.getByText("Water (g)")).toBeVisible();
  await expect(chart.getByText("Time (min:sec)")).toBeVisible();
  await expect(chart.getByText("1:00", { exact: true })).toBeVisible();
  await expect(chart.getByText("150", { exact: true })).toBeVisible();
  await expect(chart.getByText("4:00", { exact: true })).toBeVisible();
  await expect(page.getByTestId("stage-boundary")).toHaveCount(12);
  await expect(page.getByTestId("actual-marker")).toHaveCount(0);
  expect(
    await chart
      .locator("text")
      .first()
      .evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe("7px");
  expect((await chart.boundingBox())?.height).toBeGreaterThan(210);
  const marker = page.getByTestId("recommendation-marker");
  expect(Number(await marker.getAttribute("cx"))).toBeGreaterThan(52);
  expect(Number(await marker.getAttribute("cx"))).toBeLessThan(452);
  expect(
    await marker.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    ),
  ).toBe("0s");
});

test("timer brewing shows a compact progress strip instead of the full chart", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.goto("./");
  await page.getByLabel("Guide mode").selectOption("timer");
  await page.getByRole("button", { name: "Get ready" }).click();
  await page.getByRole("button", { name: "Pour now" }).click();
  const strip = page.getByTestId("progress-strip");
  await expect(strip).toBeVisible();
  await expect(page.locator(".brew-chart")).toHaveCount(0);
  await expect(page.getByTestId("progress-boundary")).toHaveCount(12);
  const plot = await page
    .getByRole("img", { name: "Recipe progress" })
    .boundingBox();
  expect(plot?.height).toBeGreaterThanOrEqual(48);
  expect(plot?.height).toBeLessThanOrEqual(72);
  const marker = page.getByTestId("progress-marker");
  const position = async () =>
    marker.evaluate((element) => ({
      left: Number.parseFloat((element as HTMLElement).style.left),
      top: Number.parseFloat((element as HTMLElement).style.top),
    }));
  const start = await position();
  await page.clock.runFor(5000);
  const later = await position();
  expect(later.left).toBeGreaterThan(start.left);
  expect(later.top).toBeLessThan(start.top);
  await page.clock.runFor(69000);
  await expect(
    page.getByRole("heading", { name: "Pour to 150 g", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("timer-strip-74s.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await marker.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    ),
  ).toBe("0s");
  expect(
    await page
      .locator(".scene-reel")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await page.clock.runFor(125000);
  await expect(strip.getByText("4:00", { exact: true })).toBeVisible();
  expect((await position()).left).toBeLessThanOrEqual(100);
});

test("preparation shows the progress strip and browsing moves its guidance marker", async ({
  page,
}, info) => {
  await page.goto("./");
  await page.getByLabel("Guide mode").selectOption("timer");
  await page.getByRole("button", { name: "Get ready" }).click();
  await expect(page.getByTestId("progress-strip")).toBeVisible();
  const marker = page.getByTestId("progress-marker");
  const left = async () =>
    marker.evaluate((element) =>
      Number.parseFloat((element as HTMLElement).style.left),
    );
  const startX = await left();
  await page.keyboard.press("ArrowRight");
  expect(await left()).toBeGreaterThan(startX);
  await expect(page.getByRole("button", { name: "Pour now" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Go to start" })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("preparation-step-preview.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Go to start" }).click();
  await expect(page.getByRole("button", { name: "Pour now" })).toBeVisible();
  expect(await left()).toBe(startX);
});
