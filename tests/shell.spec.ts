import { expect, test } from "@playwright/test";

test("loads built assets under the project path and ignores unknown hashes", async ({
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
    page.getByRole("link", { name: "Pourover Wizard V60 brew guide" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Prepare your brew" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Scale lab" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "About" })).toHaveCount(0);
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/NikolaiAndreadi",
  );
  await expect(footer.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
    "rel",
    "noreferrer",
  );
  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Skip to content" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await page.goto("./#/missing");
  await expect(
    page.getByRole("heading", { name: "Prepare your brew" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(failures).toEqual([]);
});
