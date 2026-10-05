import { expect, test } from "@playwright/test";

test("picking a recipe shows its credits, resets the dose and scales pour targets", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.goto("./");
  const picker = page.getByRole("group", { name: "Recipe" });
  await expect(picker.getByRole("radio")).toHaveCount(3);
  await expect(
    picker.getByRole("radio", { name: "Better 1 Cup V60" }),
  ).toBeChecked();
  await expect(picker.getByText("by James Hoffmann")).toHaveCount(2);
  await expect(page.getByText("Recipe by James Hoffmann")).toBeVisible();
  await expect(page.getByLabel("Coffee dose (g)")).toHaveValue("15");
  await page.getByLabel("Coffee dose (g)").fill("30");
  await expect(page.getByRole("button", { name: "Get ready" })).toBeDisabled();
  await picker.getByRole("radio", { name: "4:6 Method" }).check();
  await expect(picker.getByText("Done around 3:30")).toHaveCount(2);
  const credit = page.getByText("Recipe by Tetsu Kasuya");
  await expect(credit).toBeVisible();
  await expect(
    credit.getByRole("link", { name: "Philocoffea’s guide" }),
  ).toHaveAttribute("target", "_blank");
  await expect(page.getByLabel("Coffee dose (g)")).toHaveValue("20");
  await expect(page.getByLabel("Coffee dose (g)")).toHaveAttribute("max", "30");
  await expect(page.getByText("300 g water · 1:15.")).toBeVisible();
  await page.getByLabel("Coffee dose (g)").fill("14");
  await expect(
    page.getByText("Choose a coffee dose from 15 to 30 g."),
  ).toBeVisible();
  await page.getByLabel("Coffee dose (g)").fill("20");
  await page.getByRole("button", { name: "Get ready" }).click();
  await expect(page.getByText("Step 1 of 10 · 0:00")).toBeVisible();
  await page.getByRole("button", { name: "Start now" }).click();
  await page.clock.runFor(1000);
  await expect(
    page.getByRole("heading", { name: "Pour to 60 g", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sweetness · Step 1 of 10")).toBeVisible();
  await page.clock.fastForward(174500);
  await expect(
    page.getByRole("heading", { name: "Let it drain", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".step-now .hero-stats")).toHaveText(
    "Done around3:30",
  );
  await expect(
    page.getByText(
      "Remove the dripper at 3:30 even if water remains, then tap Done.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your brew" })).toBeVisible();
  await expect(page.getByText("Recipe by Tetsu Kasuya")).toBeVisible();
});

test("the Ultimate V60 recipe stirs, and the stir hides readings like a swirl", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page.goto("./");
  await page
    .getByRole("group", { name: "Recipe" })
    .getByRole("radio", { name: "Ultimate V60" })
    .check();
  await expect(page.getByLabel("Coffee dose (g)")).toHaveValue("30");
  await expect(page.getByText("500 g water · 1:16.67.")).toBeVisible();
  await page.getByRole("button", { name: "Get ready" }).click();
  await page.getByRole("button", { name: "Start now" }).click();
  await page.clock.fastForward(105500);
  await expect(
    page.getByRole("heading", { name: "Stir once each way", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-scene=stir]")).toHaveCount(1);
  await page.clock.fastForward(10000);
  await expect(
    page.getByRole("heading", { name: "Let it drain a little", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(15500);
  await expect(
    page.getByRole("heading", { name: "Let it drain", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Expected water guidance curve" }),
  ).toBeVisible();
  await expect(page.getByTestId("swirl-band")).toHaveCount(3);
  await expect(page.getByText("Swirl or stir")).toBeVisible();
});
