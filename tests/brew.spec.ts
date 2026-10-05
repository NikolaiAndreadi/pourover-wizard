import { expect, test } from "@playwright/test";

test("timer brew completes with truthful summary and safe cancellation/restart", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.goto("./");
  await page.getByLabel("Coffee dose (g)").fill("0");
  await expect(page.getByRole("button", { name: "Get ready" })).toBeDisabled();
  await page.getByLabel("Coffee dose (g)").fill("18");
  await page.screenshot({
    path: info.outputPath("preparation.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Get ready" }).click();
  await expect(page.getByRole("timer")).toHaveText("0:00");
  await expect(
    page.getByRole("button", { name: "Tare and auto start on weight change" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Start now" }).click();
  await page.clock.runFor(5000);
  await expect(page.getByRole("timer")).toHaveText("0:05");
  await expect(
    page.getByRole("heading", { name: "Pour to 60 g", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("pouring.png"),
    fullPage: true,
  });
  const cancel = page.getByRole("button", { name: "Hold to cancel" });
  await cancel.focus();
  await page.keyboard.down(" ");
  await page.clock.runFor(999);
  await page.keyboard.up(" ");
  await expect(
    page.getByRole("heading", { name: "Brew cancelled" }),
  ).toHaveCount(0);
  await page.clock.fastForward(116000);
  await expect(
    page.getByRole("heading", { name: "Swirl gently", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toHaveCount(0);
  await page.clock.fastForward(14000);
  await expect(
    page.getByRole("heading", { name: "Let it drain" }),
  ).toBeVisible();
  await expect(page.locator(".step-now .hero-stats")).toHaveText(
    "Done around3:00",
  );
  await expect(
    page.getByText("Tap Done when it stops dripping."),
  ).toBeVisible();
  await expect(page.locator(".step-next")).toHaveText("NextFinish");
  await expect(page.locator(".step-next .action-scene")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("drawdown.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your brew" })).toBeVisible();
  // Timer brews show no measurement rows or notes about what was not measured.
  await expect(
    page.getByRole("term").filter({ hasText: "Water poured" }),
  ).toHaveCount(0);
  await expect(page.getByText(/measured|zeroed|missing/)).toHaveCount(0);
  await expect(
    page.getByRole("definition").filter({ hasText: /^300 g$/ }),
  ).toBeVisible();
  // The finished brew can be browsed step by step and still offers a fresh brew.
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(
    page.getByRole("heading", { name: "Pour to 60 g", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Step 1 of 12 · 0:00")).toBeVisible();
  await expect(page.getByRole("img", { name: "Recipe progress" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("img", { name: "Expected water guidance curve" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Go to start" }).click();
  await expect(page.getByRole("heading", { name: "Your brew" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare another brew" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("summary.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Prepare another brew" }).click();
  await page.getByRole("button", { name: "Get ready" }).click();
  await page.getByRole("button", { name: "Start now" }).click();
  await cancel.focus();
  await page.keyboard.down("Enter");
  await page.clock.runFor(1000);
  await page.keyboard.up("Enter");
  await expect(
    page.getByRole("heading", { name: "Brew cancelled" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Prepare another brew" }).click();
  await page.getByRole("button", { name: "Get ready" }).click();
  await expect(page.getByRole("timer")).toHaveText("0:00");
});
test("a prepared brew previews every stage without starting, then returns to start", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.goto("./");
  await expect(page.getByLabel("Guide mode")).toHaveCount(0);
  await page.getByRole("button", { name: "Get ready" }).click();
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  await page.getByRole("link", { name: /Pourover Wizard/ }).click();
  await expect(
    page.getByRole("heading", { name: "Prepare your brew" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get ready" }).click();
  await expect(
    page.getByRole("img", { name: "Recipe progress" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Expected and measured water curves" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Previous step" }),
  ).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "Pour to 50 g", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Step 1 of 12 · 0:00")).toBeVisible();
  await expect(
    page.getByText("Wet all the grounds evenly; 50 g is twice the coffee."),
  ).toBeVisible();
  await expect(page.locator(".step-next")).toContainText("Swirl gently");
  await expect(page.getByRole("button", { name: "Start now" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Tare and auto start on weight change" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Go to start" })).toBeVisible();
  await page.getByRole("button", { name: "Previous step" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready when you are" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(
    page.getByRole("heading", { name: "Swirl gently", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Step 2 of 12 · 0:10")).toBeVisible();
  await page.clock.runFor(30000);
  await expect(page.getByRole("timer")).toHaveText("0:00");
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(
    page.getByRole("heading", { name: "Let it bloom", exact: true }),
  ).toBeVisible();
  for (let index = 2; index < 11; index++)
    await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "Let it drain", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Next step" })).toBeDisabled();
  await page.getByRole("button", { name: "Go to start" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready when you are" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tare and auto start on weight change" }),
  ).toHaveCount(0);
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.getByRole("button", { name: "Start now" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("button", { name: "Start now" })).toBeVisible();
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(
    page.getByText("Wet all the grounds evenly; 50 g is twice the coffee."),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Go to start" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("navigation", { name: "Preview brew steps" }),
  ).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect(page.getByRole("timer")).toHaveText("0:01");
  // Hash changes have no routes to switch, so the in-memory brew keeps running.
  await page.evaluate(() => {
    window.location.hash = "#/missing";
  });
  await page.clock.runFor(1000);
  await page.evaluate(() => {
    window.location.hash = "#/";
  });
  await expect(page.getByRole("timer")).toHaveText("0:02");
});
test("horizontal swipes browse steps like the arrow keys; vertical and cancelled ones do not", async ({
  page,
}) => {
  const swipe = (dx: number, dy = 0, cancelled = false) =>
    page.locator("main").evaluate(
      (target, { dx, dy, cancelled }) => {
        const touch = (x: number, y: number) =>
          new Touch({ identifier: 1, target, clientX: x, clientY: y });
        const fire = (type: string, at: Touch) =>
          target.dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              touches: type === "touchstart" ? [at] : [],
              changedTouches: [at],
            }),
          );
        fire("touchstart", touch(200, 300));
        if (cancelled) fire("touchcancel", touch(200 + dx, 300 + dy));
        fire("touchend", touch(200 + dx, 300 + dy));
      },
      { dx, dy, cancelled },
    );
  await page.goto("./");
  await expect(page.locator("main")).toHaveCSS("touch-action", "auto");
  await page.getByRole("button", { name: "Get ready" }).click();
  // Native panning would otherwise claim the gesture before touchend.
  await expect(page.locator("main")).toHaveCSS(
    "touch-action",
    "pan-y pinch-zoom",
  );
  await swipe(-120, 90);
  await swipe(-120, 0, true);
  await expect(
    page.getByRole("heading", { name: "Ready when you are" }),
  ).toBeVisible();
  await swipe(-120);
  await expect(
    page.getByRole("heading", { name: "Pour to 50 g", exact: true }),
  ).toBeVisible();
  await swipe(-120);
  await expect(
    page.getByRole("heading", { name: "Swirl gently", exact: true }),
  ).toBeVisible();
  await swipe(120);
  await swipe(120);
  await expect(
    page.getByRole("heading", { name: "Ready when you are" }),
  ).toBeVisible();
});
test("pointer cancellation, focus loss and page hiding release incomplete holds", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.goto("./");
  await page.getByRole("button", { name: "Get ready" }).click();
  await page.getByRole("button", { name: "Start now" }).click();
  const cancel = page.getByRole("button", { name: "Hold to cancel" });
  await cancel.hover();
  await page.mouse.down();
  await page.clock.runFor(500);
  expect(
    await cancel.evaluate((element) =>
      (element as HTMLElement).style.getPropertyValue("--hold"),
    ),
  ).toBe("0.5");
  await cancel.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await page.clock.runFor(1500);
  await expect(page.getByRole("timer")).toHaveText("0:02");
  await cancel.focus();
  await page.keyboard.down(" ");
  await page.clock.runFor(500);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.runFor(1500);
  await page.keyboard.up(" ");
  await expect(page.getByRole("timer")).toHaveText("0:04");
  await cancel.focus();
  await page.keyboard.down(" ");
  await page.clock.runFor(500);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await page.clock.runFor(1500);
  await page.keyboard.up(" ");
  await expect(page.getByRole("timer")).toHaveText("0:06");
  expect(errors).toEqual([]);
});
