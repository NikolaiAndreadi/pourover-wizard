import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// A separate origin serves real built assets and simulates a later deployment.
let server: Server;
let appUrl: string;
let version = 1;
let failDownload = false;
test.beforeEach(async () => {
  version = 1;
  failDownload = false;
  server = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith("/pourover-wizard/")) {
      response.writeHead(404).end();
      return;
    }
    const name = path.slice("/pourover-wizard/".length) || "index.html";
    if (name.includes("..") || (failDownload && name.endsWith(".css"))) {
      response.writeHead(503).end();
      return;
    }
    try {
      let body = await readFile(resolve("dist", name));
      if (name === "sw.js")
        body = Buffer.from(
          body
            .toString()
            .replace(/pourover-wizard-([a-f0-9]+)/, `$&-v${version}`),
        );
      if (name === "index.html" && version > 1)
        body = Buffer.from(
          body.toString().replace("</title>", ` v${version}</title>`),
        );
      const type = name.endsWith(".js")
        ? "text/javascript"
        : name.endsWith(".css")
          ? "text/css"
          : name.endsWith(".png")
            ? "image/png"
            : name.endsWith(".webmanifest")
              ? "application/manifest+json"
              : "text/html";
      response
        .writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" })
        .end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No test server port");
  appUrl = `http://127.0.0.1:${address.port}/pourover-wizard/`;
});
test.afterEach(async () => {
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
});

test("cached app cold-opens offline, survives a hash-route reload and brews", async ({
  context,
  page,
}) => {
  await page.goto(appUrl);
  await expect(
    page.getByText("Available offline", { exact: true }),
  ).toBeVisible();
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    return await (await fetch(link?.href ?? "")).json();
  });
  expect(manifest.start_url).toBe("/pourover-wizard/");
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual([
    "192x192",
    "512x512",
  ]);
  await context.setOffline(true);
  await page.close();
  const offline = await context.newPage();
  await offline.goto(`${appUrl}#/`);
  await expect(
    offline.getByRole("heading", {
      name: "Your daily pour-over, with room to focus.",
    }),
  ).toBeVisible();
  await offline.reload();
  await expect(
    offline.getByRole("heading", {
      name: "Your daily pour-over, with room to focus.",
    }),
  ).toBeVisible();
  await offline.getByRole("button", { name: "Get ready" }).click();
  await offline.getByRole("button", { name: "Pour now" }).click();
  await expect(offline.getByRole("timer")).toBeVisible();
  const cached = await offline.evaluate(async () => {
    return Promise.all(
      ["manifest.webmanifest", "icon-192.png", "icon-512.png"].map(
        async (name) => (await fetch(name)).status,
      ),
    );
  });
  expect(cached).toEqual([200, 200, 200]);
});

test("failed update retains offline version; complete update waits for every tab to close", async ({
  context,
  page,
}) => {
  await page.goto(appUrl);
  await expect(
    page.getByText("Available offline", { exact: true }),
  ).toBeVisible();
  const second = await context.newPage();
  await second.goto(appUrl);
  await page.getByRole("button", { name: "Get ready" }).click();
  await page.getByRole("button", { name: "Pour now" }).click();
  await page.evaluate(() => {
    (window as Window & { brewMarker?: string }).brewMarker = "preserved";
  });
  version = 2;
  failDownload = true;
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    const worker = registration.installing;
    if (worker)
      await new Promise<void>((done) => {
        worker.addEventListener("statechange", () => {
          if (worker.state === "redundant") done();
        });
        if (worker.state === "redundant") done();
      });
  });
  await expect(page.getByRole("status")).toHaveCount(0);
  await context.setOffline(true);
  await second.reload();
  await expect(second).toHaveTitle("Pourover Wizard");
  await context.setOffline(false);
  failDownload = false;
  // Returning online invokes the app's own update check.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status")).toContainText("Update ready");
  await expect(page.getByRole("timer")).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as Window & { brewMarker?: string }).brewMarker,
    ),
  ).toBe("preserved");
  await expect(page).toHaveTitle("Pourover Wizard");
  await page.close();
  await second.reload();
  await expect(second).toHaveTitle("Pourover Wizard");
  await expect(second.getByRole("status")).toContainText("Update ready");
  await context.setOffline(true);
  await second.close();
  const reopened = await context.newPage();
  await reopened.goto(appUrl);
  await expect(reopened).toHaveTitle("Pourover Wizard v2");
  await expect(
    reopened.getByText("Available offline", { exact: true }),
  ).toBeVisible();
});
