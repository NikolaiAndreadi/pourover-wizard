import type { Page } from "@playwright/test";

declare global {
  interface Window {
    pourZoomMock: { emit(bytes: number[]): void };
  }
}

/** A Web Bluetooth mock exposing one BOOKOO-like device; `window.pourZoomMock.emit` sends a frame. */
export async function mockScale(page: Page) {
  await page.addInitScript(() => {
    const characteristic = new EventTarget();
    const notify = Object.assign(characteristic, {
      value: new DataView(new ArrayBuffer(0)),
      properties: { write: true, writeWithoutResponse: false },
      async startNotifications() {
        return this;
      },
      async stopNotifications() {
        return this;
      },
      async writeValueWithResponse() {},
      async writeValueWithoutResponse() {},
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
    const device = Object.assign(new EventTarget(), { gatt: server });
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {
        async requestDevice() {
          return device;
        },
      },
    });
    window.pourZoomMock = {
      emit(bytes) {
        notify.value = new DataView(Uint8Array.from(bytes).buffer);
        characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
      },
    };
  });
}
