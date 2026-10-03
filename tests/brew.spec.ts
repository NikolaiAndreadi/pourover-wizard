import { expect, test } from "@playwright/test";

test("timer brew completes with truthful summary and safe cancellation/restart", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.goto("./");
  await page.getByLabel("Coffee dose (g)").fill("0");
  await expect(
    page.getByRole("button", { name: "Prepare brew" }),
  ).toBeDisabled();
  await page.getByLabel("Coffee dose (g)").fill("18");
  await page.screenshot({
    path: info.outputPath("preparation.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Prepare brew" }).click();
  await expect(page.getByRole("timer")).toHaveText("0:00");
  await expect(
    page.getByRole("button", { name: "Arm auto-start" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Pour now" }).click();
  await page.clock.runFor(5000);
  await expect(page.getByRole("timer")).toHaveText("0:05");
  await page.screenshot({
    path: info.outputPath("pouring.png"),
    fullPage: true,
  });
  const cancel = page.getByRole("button", { name: "Hold 3 seconds to cancel" });
  await cancel.focus();
  await page.keyboard.down(" ");
  await page.clock.runFor(2999);
  await page.keyboard.up(" ");
  await expect(
    page.getByRole("heading", { name: "Brew cancelled" }),
  ).toHaveCount(0);
  await page.clock.fastForward(130000);
  await expect(
    page.getByRole("heading", { name: "Let the coffee drain" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("drawdown.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Brew summary" }),
  ).toBeVisible();
  await expect(
    page.getByText("No scale measurements were recorded.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("definition").filter({ hasText: /^300 g$/ }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("summary.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Prepare another brew" }).click();
  await page.getByRole("button", { name: "Prepare brew" }).click();
  await page.getByRole("button", { name: "Pour now" }).click();
  await cancel.focus();
  await page.keyboard.down("Enter");
  await page.clock.runFor(3000);
  await page.keyboard.up("Enter");
  await expect(
    page.getByRole("heading", { name: "Brew cancelled" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Prepare another brew" }).click();
  await page.getByRole("button", { name: "Prepare brew" }).click();
  await expect(page.getByRole("timer")).toHaveText("0:00");
});
test("simulated scale requires explicit arming, starts once, preserves brew across navigation", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.goto("./");
  await page.getByLabel("Guide mode").selectOption("fake");
  await page.getByRole("button", { name: "Prepare brew" }).click();
  await page.clock.runFor(3000);
  await expect(page.getByRole("timer")).toHaveText("0:00");
  await page
    .getByRole("button", { name: "Tare simulated scale", exact: true })
    .click();
  await page.clock.runFor(1000);
  await expect(
    page.getByRole("heading", { name: "Ready when you are" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Arm auto-start" }).click();
  await page.clock.runFor(30000);
  await expect(page.getByRole("timer")).toHaveText("0:00");
  await page.getByRole("button", { name: "Simulate a pour" }).click();
  await page.clock.runFor(1000);
  await expect(
    page.getByRole("heading", { name: "Bloom · pour gently" }),
  ).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText("0:01");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "About" })
    .click();
  await page.clock.runFor(1000);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Home" })
    .click();
  await expect(page.getByRole("timer")).toHaveText("0:02");
  await page.clock.runFor(179000);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Brew summary" }),
  ).toBeVisible();
  await expect(
    page.getByText("Simulated poured water: 250", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Expected and simulated water curves" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("fake-summary.png"),
    fullPage: true,
  });
});
test("Learn uses shared timed engine at1x and4x; cancel remains physical3seconds", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.goto("./");
  await page.getByLabel("Guide mode").selectOption("learn");
  await page.getByLabel("Playback speed").selectOption("4");
  await page.getByRole("button", { name: "Prepare brew" }).click();
  await page.getByRole("button", { name: "Pour now" }).click();
  await page.clock.runFor(5000);
  await expect(page.getByRole("timer")).toHaveText("0:20");
  await page.getByLabel("Playback speed").selectOption("1");
  await page.clock.runFor(5000);
  await expect(page.getByRole("timer")).toHaveText("0:25");
  await page.getByLabel("Playback speed").selectOption("4");
  const cancel = page.getByRole("button", { name: "Hold 3 seconds to cancel" });
  await cancel.focus();
  await page.keyboard.down(" ");
  await page.clock.runFor(750);
  await expect(
    page.getByRole("heading", { name: "Brew cancelled" }),
  ).toHaveCount(0);
  await page.keyboard.up(" ");
  await page.clock.runFor(30000);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByText("Rehearsal complete", { exact: true }),
  ).toBeVisible();
});
test("pointer cancellation, focus loss and navigation release incomplete holds", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.goto("./");
  await page.getByRole("button", { name: "Prepare brew" }).click();
  await page.getByRole("button", { name: "Pour now" }).click();
  const cancel = page.getByRole("button", { name: "Hold 3 seconds to cancel" });
  await cancel.hover();
  await page.mouse.down();
  await page.clock.runFor(1000);
  await expect(page.getByLabel("Cancel hold progress")).toHaveJSProperty(
    "value",
    1 / 3,
  );
  await cancel.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await page.clock.runFor(3000);
  await expect(page.getByRole("timer")).toHaveText("0:04");
  await cancel.focus();
  await page.keyboard.down(" ");
  await page.clock.runFor(1000);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.runFor(3000);
  await page.keyboard.up(" ");
  await expect(page.getByRole("timer")).toHaveText("0:08");
  await cancel.focus();
  await page.keyboard.down(" ");
  await page.clock.runFor(1000);
  await page.evaluate(() => {
    window.location.hash = "#/about";
  });
  await page.clock.runFor(3000);
  await page.keyboard.up(" ");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Home" })
    .click();
  await expect(page.getByRole("timer")).toHaveText("0:12");
  await cancel.focus();
  await page.keyboard.down(" ");
  await page.clock.runFor(1000);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await page.clock.runFor(3000);
  await page.keyboard.up(" ");
  await expect(page.getByRole("timer")).toHaveText("0:16");
  expect(errors).toEqual([]);
});
