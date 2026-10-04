import { expect, test } from "@playwright/test";

test("the chosen recipe and each recipe's last valid dose survive a reload", async ({
  page,
}) => {
  await page.goto("./");
  const picker = page.getByRole("group", { name: "Recipe" });
  const dose = page.getByLabel("Coffee dose (g)");
  await picker.getByRole("radio", { name: "4:6 Method" }).check();
  await dose.fill("22");
  await expect(page.getByText("330 g water · 1:15.")).toBeVisible();
  await dose.fill("9");
  await expect(
    page.getByText("Choose a coffee dose from 15 to 30 g."),
  ).toBeVisible();
  await page.reload();
  await expect(picker.getByRole("radio", { name: "4:6 Method" })).toBeChecked();
  await expect(dose).toHaveValue("22");
  await expect(page.getByText("330 g water · 1:15.")).toBeVisible();
  await picker.getByRole("radio", { name: "Better 1 Cup V60" }).check();
  await expect(dose).toHaveValue("15");
  await expect(page.getByText("250 g water · 1:16.67.")).toBeVisible();
  await picker.getByRole("radio", { name: "4:6 Method" }).check();
  await expect(dose).toHaveValue("22");
  await expect(page.getByText("330 g water · 1:15.")).toBeVisible();
  await page.reload();
  await expect(picker.getByRole("radio", { name: "4:6 Method" })).toBeChecked();
  await expect(dose).toHaveValue("22");
});
for (const [label, raw] of [
  ["corrupt JSON", "{not json"],
  [
    "an unknown recipe and an out-of-range dose",
    '{"recipeId":"unknown","doses":{"hoffmann-better-one-cup":99}}',
  ],
] as const) {
  test(`${label} in storage still shows the default recipe and dose`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem("pourover-wizard.brew", value);
    }, raw);
    await page.goto("./");
    await expect(
      page
        .getByRole("group", { name: "Recipe" })
        .getByRole("radio", { name: "Better 1 Cup V60" }),
    ).toBeChecked();
    await expect(page.getByLabel("Coffee dose (g)")).toHaveValue("15");
    await expect(page.getByText("250 g water · 1:16.67.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Get ready" })).toBeEnabled();
  });
}
