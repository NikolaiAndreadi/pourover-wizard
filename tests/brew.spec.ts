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
  const cancel = page.getByRole("button", { name: "Hold 1 second to cancel" });
  await cancel.focus();
  await page.keyboard.down(" ");
  await page.clock.runFor(999);
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
  await page.clock.runFor(1000);
  await page.keyboard.up("Enter");
  await expect(
    page.getByRole("heading", { name: "Brew cancelled" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Prepare another brew" }).click();
  await page.getByRole("button", { name: "Prepare brew" }).click();
  await expect(page.getByRole("timer")).toHaveText("0:00");
});
for (const mode of ["timer", "live"] as const) {
  test(`${mode} prepared brew previews every stage without starting, then returns to start`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
    await page.goto("./");
    await expect(page.getByLabel("Guide mode").locator("option")).toHaveText([
      "Timer only",
      "BOOKOO live scale",
    ]);
    await page.getByLabel("Guide mode").selectOption(mode);
    await page.getByRole("button", { name: "Prepare brew" }).click();
    await expect(
      page.getByRole("img", {
        name:
          mode === "timer"
            ? "Expected water guidance curve"
            : "Expected and measured water curves",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Previous step" }),
    ).toBeDisabled();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("heading", { name: "Gently swirl", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/At 0:10/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Pour now" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Arm auto-start" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Go to start" }),
    ).toBeVisible();
    await page.clock.runFor(30000);
    await expect(page.getByRole("timer")).toHaveText("0:00");
    await page.getByRole("button", { name: "Next step" }).click();
    await expect(
      page.getByRole("heading", { name: "Let the coffee bloom", exact: true }),
    ).toBeVisible();
    for (let index = 2; index < 11; index++)
      await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("heading", { name: "Let the coffee drain", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next step" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Go to start" }).click();
    await expect(
      page.getByRole("heading", { name: "Ready when you are" }),
    ).toBeVisible();
    if (mode === "live")
      await expect(
        page.getByRole("button", { name: "Arm auto-start" }),
      ).toBeVisible();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByRole("button", { name: "Pour now" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("button", { name: "Pour now" })).toBeVisible();
    await page.getByRole("button", { name: "Pour now" }).click();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "Go to start" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("navigation", { name: "Preview brew steps" }),
    ).toHaveCount(0);
    await page.clock.runFor(1000);
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
  });
}
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
  const cancel = page.getByRole("button", { name: "Hold 1 second to cancel" });
  await cancel.hover();
  await page.mouse.down();
  await page.clock.runFor(500);
  await expect(page.getByLabel("Cancel hold progress")).toHaveJSProperty(
    "value",
    0.5,
  );
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
  await page.evaluate(() => {
    window.location.hash = "#/about";
  });
  await page.clock.runFor(1500);
  await page.keyboard.up(" ");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Home" })
    .click();
  await expect(page.getByRole("timer")).toHaveText("0:06");
  await cancel.focus();
  await page.keyboard.down(" ");
  await page.clock.runFor(500);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await page.clock.runFor(1500);
  await page.keyboard.up(" ");
  await expect(page.getByRole("timer")).toHaveText("0:08");
  expect(errors).toEqual([]);
});
