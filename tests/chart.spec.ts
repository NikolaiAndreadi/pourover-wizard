import { expect, test } from "@playwright/test";

for (const mode of ["timer"] as const) {
  test(`${mode} chart shows a moving recommendation, readable axes, and neighboring steps`, async ({
    page,
  }, info) => {
    await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
    await page.goto("./");
    await page.getByLabel("Guide mode").selectOption(mode);
    await page.getByRole("button", { name: "Prepare brew" }).click();
    await page.getByRole("button", { name: "Pour now" }).click();
    const chart = page.locator(".brew-chart");
    const marker = page.getByTestId("recommendation-marker");
    const startX = Number(await marker.getAttribute("cx"));
    const startY = Number(await marker.getAttribute("cy"));
    await page.clock.runFor(5000);
    expect(Number(await marker.getAttribute("cx"))).toBeGreaterThan(startX);
    expect(Number(await marker.getAttribute("cy"))).toBeLessThan(startY);
    await expect(chart.getByText("Water (g)")).toBeVisible();
    await expect(chart.getByText("Time (min:sec)")).toBeVisible();
    await expect(chart.getByText("0:30", { exact: true })).toBeVisible();
    await expect(chart.getByText("150", { exact: true })).toBeVisible();
    await expect(page.getByTestId("actual-marker")).toHaveCount(0);
    await expect(page.getByTestId("stage-boundary")).toHaveCount(12);
    expect(
      await chart
        .locator("text")
        .first()
        .evaluate((element) => getComputedStyle(element).fontSize),
    ).toBe("7px");
    await page.clock.runFor(69000);
    await expect(
      page.getByRole("heading", { name: "Third pour", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".step-previous")).toContainText("Pause");
    await expect(page.locator(".step-current")).toContainText("Third pour");
    await expect(page.locator(".step-next")).toContainText("Pause");
    await expect(page.locator(".step-current")).toHaveAttribute(
      "aria-current",
      "step",
    );
    await page.screenshot({
      path: info.outputPath(`${mode}-chart-74s.png`),
      fullPage: true,
    });
    const bounds = await chart.boundingBox();
    expect(bounds?.height).toBeGreaterThan(210);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.clock.runFor(2000);
    await expect(page.locator(".step-next")).toContainText("0:04");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await marker.evaluate(
        (element) => getComputedStyle(element).transitionDuration,
      ),
    ).toBe("0s");
    expect(
      await page
        .locator(".step-context")
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("none");
    await page.clock.runFor(4000);
    await expect(
      page.getByRole("heading", { name: "Pause", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".step-previous")).toContainText("Third pour");
    await expect(page.locator(".step-next")).toContainText("Fourth pour");
    await page.clock.runFor(121000);
    await expect(chart.getByText("4:00", { exact: true })).toBeVisible();
    expect(Number(await marker.getAttribute("cx"))).toBeLessThan(452);
  });
}

test("preparation shows the plot and browsing moves its guidance marker", async ({
  page,
}, info) => {
  await page.goto("./");
  await page.getByLabel("Guide mode").selectOption("timer");
  await page.getByRole("button", { name: "Prepare brew" }).click();
  const chart = page.locator(".brew-chart");
  await expect(chart).toBeVisible();
  const marker = page.getByTestId("recommendation-marker");
  const startX = Number(await marker.getAttribute("cx"));
  await page.keyboard.press("ArrowRight");
  expect(Number(await marker.getAttribute("cx"))).toBeGreaterThan(startX);
  await expect(page.getByRole("button", { name: "Pour now" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Go to start" })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("preparation-step-preview.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Go to start" }).click();
  await expect(page.getByRole("button", { name: "Pour now" })).toBeVisible();
  expect(Number(await marker.getAttribute("cx"))).toBe(startX);
});
