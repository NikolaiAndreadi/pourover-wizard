import { expect, test } from "@playwright/test";
import { syntheticFrame } from "../src/scale/bookoo/synthetic.fixture";
import { createRecorder, parseRecording } from "../src/scale/recording/session";
import { syntheticMetadata } from "../src/scale/recording/synthetic.fixture";

test("scale lab supports raw-only synthetic replay without a connected device", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("./#/scale-lab");
  await expect(
    page.getByRole("heading", { name: "BOOKOO scale lab" }),
  ).toBeVisible();
  await expect(
    page.getByText("Web Bluetooth is unavailable in this browser."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect and start capture" }),
  ).toBeDisabled();
  const recorder = createRecorder(
    { ...syntheticMetadata, encoding: null },
    "synthetic",
    () => 0,
  );
  const frame = syntheticFrame();
  recorder.append({ kind: "connected" });
  recorder.append({
    kind: "notification",
    bytes: Array.from(frame.subarray(0, 4)),
  });
  recorder.append({
    kind: "notification",
    bytes: Array.from(frame.subarray(4)),
  });
  await page.getByLabel("Replay a downloaded session").setInputFiles({
    name: "synthetic-session.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(recorder.snapshot())),
  });
  await expect(page.getByRole("alert")).toContainText(
    "synthetic replay: 1 valid frames, 0 calibrated samples, 0 checksum failures",
  );
  await page.getByLabel("Replay a downloaded session").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Unexpected recording fields",
  );
});

test("mock scale captures raw bytes and command attempts without persisting device identifiers", async ({
  page,
}) => {
  const frame = Array.from(syntheticFrame());
  await page.addInitScript((bytes) => {
    const characteristic = new EventTarget();
    const writes: number[][] = [];
    const notify = Object.assign(characteristic, {
      value: new DataView(Uint8Array.from(bytes).buffer),
      properties: { write: true, writeWithoutResponse: false },
      async startNotifications() {
        characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
        return this;
      },
      async stopNotifications() {
        return this;
      },
      async writeValueWithResponse(value: Uint8Array) {
        writes.push(Array.from(value));
      },
      async writeValueWithoutResponse(value: Uint8Array) {
        writes.push(Array.from(value));
      },
    });
    const server = {
      connected: false,
      async connect() {
        this.connected = true;
        return this;
      },
      disconnect() {
        this.connected = false;
      },
      async getPrimaryService() {
        return {
          async getCharacteristic() {
            return notify;
          },
        };
      },
    };
    const device = Object.assign(new EventTarget(), {
      id: "stable-device-secret",
      name: "private-device-name",
      gatt: server,
    });
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {
        async requestDevice() {
          return device;
        },
      },
    });
    (window as Window & { labWrites?: number[][] }).labWrites = writes;
  }, frame);
  await page.goto("./#/scale-lab");
  await page.getByRole("button", { name: "Connect and start capture" }).click();
  await expect(page.getByRole("status")).toContainText("Connection: connected");
  await expect(page.getByText("Latest notification (hex):")).toContainText(
    "03 0b",
  );
  await expect(page.getByRole("status")).toContainText(
    "Weight decoding awaiting confirmed calibration",
  );
  await page.getByRole("button", { name: "Tare", exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as Window & { labWrites?: number[][] }).labWrites,
    ),
  ).toEqual([[3, 10, 1, 0, 0, 8]]);
  await page
    .getByLabel("Annotation", { exact: true })
    .fill("positive known mass");
  await page.getByRole("button", { name: "Mark event" }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Connection: disconnected",
  );
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download raw session" }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  const recording = parseRecording(text);
  expect(recording.source).toBe("hardware"); // The mocked browser executes the live path; this artifact is not hardware evidence.
  expect(recording.metadata.encoding).toBeNull();
  expect(recording.events.map((event) => event.kind)).toEqual([
    "connected",
    "notification",
    "command",
    "annotation",
    "disconnected",
  ]);
  expect(text).not.toContain("stable-device-secret");
  expect(text).not.toContain("private-device-name");
});
