import { expect, test } from "@playwright/test";

test("loads built assets under the project path and preserves hash navigation", async ({
  page,
}, testInfo) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      failures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("./");
  await expect(page).toHaveTitle("Pourover Wizard");
  await expect(
    page.getByRole("link", { name: "Pourover Wizard V60 · one cup" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Your daily pour-over, with room to focus.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Home" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Scale lab" })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "About" })
    .click();
  await expect(page).toHaveURL(/\/pourover-wizard\/#\/about$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "One cup. A clear routine." }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("about.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Skip to content" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await expect(page).toHaveURL(/#\/about$/);
  await page.goBack();
  await expect(
    page.getByRole("heading", {
      name: "Your daily pour-over, with room to focus.",
    }),
  ).toBeVisible();
  await page.goto("./#/missing");
  await expect(
    page.getByRole("heading", {
      name: "Your daily pour-over, with room to focus.",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(failures).toEqual([]);
});
