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
  await expect(page).toHaveTitle("Pourover Wizard · V60 brew guide");
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
  const github = footer.getByRole("link", { name: "GitHub" });
  await expect(github).toHaveAttribute(
    "href",
    "https://github.com/NikolaiAndreadi/pourover-wizard",
  );
  await expect(github).toHaveAttribute("rel", "noreferrer");
  await expect(footer.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
    "rel",
    "noreferrer",
  );
  await expect(footer.getByRole("link")).toHaveCount(2);
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

test("the footer theme switch cycles system, light and dark and is remembered", async ({
  page,
}) => {
  await page.goto("./");
  const root = page.locator("html");
  const toggle = page.getByRole("button", { name: /^Theme · / });
  await expect(toggle).toHaveText("Theme · System");
  await expect(root).not.toHaveAttribute("data-theme");
  await toggle.click();
  await expect(toggle).toHaveText("Theme · Light");
  await expect(root).toHaveAttribute("data-theme", "light");
  await toggle.click();
  await expect(toggle).toHaveText("Theme · Dark");
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveCSS("background-color", "rgb(32, 37, 31)");
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveText("Theme · Dark");
  await toggle.click();
  await expect(toggle).toHaveText("Theme · System");
  await expect(root).not.toHaveAttribute("data-theme");
  expect(
    await page.evaluate(() => localStorage.getItem("pourover-wizard.theme")),
  ).toBeNull();
});

test("the footer Sound Assist switch defaults to off and is remembered", async ({
  page,
}) => {
  await page.goto("./");
  const toggle = page.getByRole("button", { name: /^Sound Assist · / });
  await expect(toggle).toHaveText("Sound Assist · Off");
  await toggle.click();
  await expect(toggle).toHaveText("Sound Assist · On");
  await page.reload();
  await expect(toggle).toHaveText("Sound Assist · On");
  await toggle.click();
  await expect(toggle).toHaveText("Sound Assist · Off");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("pourover-wizard.sound-assist"),
    ),
  ).toBeNull();
});
