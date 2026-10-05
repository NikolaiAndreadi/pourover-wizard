import { expect, type Page, test } from "@playwright/test";
import { syntheticFrame } from "../src/scale/bookoo/synthetic.fixture";
import { mockScale } from "./mockScale";

const KEY = "pourover-wizard.history";
const TIME_ZONE = "Europe/Berlin";
const LOCALE = "en-GB";

test.use({ timezoneId: TIME_ZONE, locale: LOCALE });

interface StoredHistory {
  brews: { completedAt: string; mode: string; pouredGrams: number | null }[];
}
const storedHistory = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null") as StoredHistory,
    KEY,
  );
async function openPage(page: Page) {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.goto("./");
}
/** Starts the default recipe, runs into drawdown and taps Done. */
async function completeTimerBrew(page: Page) {
  await page.getByRole("button", { name: "Get ready" }).click();
  await page.getByRole("button", { name: "Start now" }).click();
  await page.clock.fastForward(131000);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your brew" })).toBeVisible();
}
async function holdWithKeyboard(page: Page, name: string) {
  await page.getByRole("button", { name }).focus();
  await page.keyboard.down(" ");
  await page.clock.runFor(1000);
  await page.keyboard.up(" ");
}

test("a completed timer brew is kept in local time, reviewed step by step and deleted", async ({
  page,
}) => {
  await openPage(page);
  await expect(
    page.getByRole("button", { name: "Brew history" }),
  ).toBeVisible();
  await completeTimerBrew(page);
  const stored = await storedHistory(page);
  expect(stored.brews).toHaveLength(1);
  const completedAt = stored.brews[0]?.completedAt ?? "";
  expect(completedAt).toMatch(/^2026-10-03T00:02:1\d\.\d{3}Z$/);
  expect(stored.brews[0]).toMatchObject({ mode: "timer", pouredGrams: null });
  const local = new Date(completedAt).toLocaleString(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  });
  expect(local).toMatch(/^3 Oct 2026, 02:02$/);
  await page.getByRole("button", { name: "Prepare another brew" }).click();
  await page.getByRole("button", { name: "Brew history" }).click();
  await expect(
    page.getByRole("heading", { name: "Brew history" }),
  ).toBeVisible();
  const row = page.getByRole("button", { name: /Better 1 Cup V60/ });
  await expect(row).toContainText(local);
  await expect(row).toContainText(/15 g coffee · 2:1\d · 250 g water/);
  await expect(
    page.getByRole("button", { name: `Delete brew from ${local}` }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("history.png"),
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Brew history" }).click();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("heading", { name: "Your brew" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare another brew" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Previous step" }),
  ).toBeDisabled();
  await expect(page.getByRole("img", { name: "Recipe progress" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("img", { name: "Expected water guidance curve" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(
    page.getByRole("heading", { name: "Pour to 50 g", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Step 1 of 12 · 0:00")).toBeVisible();
  await expect(page.locator(".step-next")).toContainText("Swirl gently");
  await expect(
    page.getByText("Wet all the grounds evenly; 50 g is twice the coffee."),
  ).toBeVisible();
  await expect(page.getByText("Aim for")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Recipe progress" })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("pour-zoom")).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "Expected water guidance curve" }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("history-step.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Previous step" }).click();
  await expect(page.getByRole("heading", { name: "Your brew" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "Swirl gently", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Step 2 of 12 · 0:10")).toBeVisible();
  for (let index = 2; index < 12; index++)
    await page.getByRole("button", { name: "Next step" }).click();
  await expect(
    page.getByRole("heading", { name: "Let it drain", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Next step" })).toBeDisabled();
  await page.getByRole("button", { name: "Go to start" }).click();
  await expect(page.getByRole("heading", { name: "Your brew" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Go to start" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("heading", { name: "Brew history" }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Delete brew from ${local}` }).click();
  await expect(page.getByText("No brews yet.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hold to clear history" }),
  ).toHaveCount(0);
  expect((await storedHistory(page)).brews).toEqual([]);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("heading", { name: "Prepare your brew" }),
  ).toBeVisible();
});

test("a hold clears every saved brew, and the brand link leaves the history screens", async ({
  page,
}) => {
  await openPage(page);
  await completeTimerBrew(page);
  await page.getByRole("button", { name: "Prepare another brew" }).click();
  await completeTimerBrew(page);
  await page.getByRole("button", { name: "Prepare another brew" }).click();
  await page.getByRole("button", { name: "Brew history" }).click();
  await expect(page.locator(".history-row")).toHaveCount(2);
  await page.locator(".history-row").first().click();
  await expect(page.getByRole("heading", { name: "Your brew" })).toBeVisible();
  await page.getByRole("link", { name: /Pourover Wizard/ }).click();
  await expect(
    page.getByRole("heading", { name: "Prepare your brew" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Brew history" }).click();
  // A tap must not clear; a one-second hold under the installed clock does.
  await page.getByRole("button", { name: "Hold to clear history" }).click();
  await expect(page.locator(".history-row")).toHaveCount(2);
  await holdWithKeyboard(page, "Hold to clear history");
  await expect(page.getByText("No brews yet.")).toBeVisible();
  // Clearing removes the key itself.
  expect(await storedHistory(page)).toBeNull();
  await page.getByRole("link", { name: /Pourover Wizard/ }).click();
  await expect(
    page.getByRole("heading", { name: "Prepare your brew" }),
  ).toBeVisible();
});

test("a cancelled brew is not kept", async ({ page }) => {
  await openPage(page);
  await page.getByRole("button", { name: "Get ready" }).click();
  await page.getByRole("button", { name: "Start now" }).click();
  await page.clock.runFor(5000);
  await holdWithKeyboard(page, "Hold to cancel");
  await expect(
    page.getByRole("heading", { name: "Brew cancelled" }),
  ).toBeVisible();
  expect(await storedHistory(page)).toBeNull();
  await page.getByRole("button", { name: "Prepare another brew" }).click();
  await page.getByRole("button", { name: "Brew history" }).click();
  await expect(page.getByText("No brews yet.")).toBeVisible();
});

test("a saved live brew replays its pour zoom and measured chart", async ({
  page,
}) => {
  await mockScale(page);
  await openPage(page);
  await page.getByRole("button", { name: "Get ready" }).click();
  await page.getByRole("button", { name: "Connect scale" }).click();
  await expect(
    page.getByRole("button", { name: /^BOOKOO Themis Mini · / }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start now" }).click();
  for (const grams of [5, 12, 20, 30, 40]) {
    await page.clock.runFor(250);
    await page.evaluate(
      (bytes) => window.pourZoomMock.emit(bytes),
      Array.from(
        syntheticFrame({ magnitude: grams * 100, unit: 1, sign: 0x2b }),
      ),
    );
  }
  await expect(page.getByTestId("pour-zoom-latest")).toBeVisible();
  await page.clock.fastForward(131000);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your brew" })).toBeVisible();
  expect((await storedHistory(page)).brews[0]).toMatchObject({ mode: "live" });
  await page.getByRole("button", { name: "Prepare another brew" }).click();
  await page.getByRole("button", { name: "Brew history" }).click();
  await page.getByRole("button", { name: /Better 1 Cup V60/ }).click();
  await expect(page.getByRole("heading", { name: "Your brew" })).toBeVisible();
  await expect(page.getByTestId("actual-series")).toHaveCount(1);
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(
    page.getByRole("heading", { name: "Pour to 50 g", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("pour-zoom")).toBeVisible();
  await expect(page.getByTestId("pour-zoom-actual")).toHaveCount(1);
  await expect(page.getByTestId("pour-zoom-latest")).toHaveCount(0);
  await expect(page.getByTestId("actual-series")).toHaveCount(1);
  await page.screenshot({
    path: test.info().outputPath("history-live-step.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(
    page.getByRole("heading", { name: "Swirl gently", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("pour-zoom")).toHaveCount(0);
});
