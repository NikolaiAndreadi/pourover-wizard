import type { Page } from "@playwright/test";

declare global {
  interface Window {
    beeps: number[];
  }
}
/** Records scheduled note frequencies using the page clock. */
export async function installFakeAudio(page: Page, soundAssist = true) {
  await page.addInitScript((on) => {
    localStorage.setItem("pourover-wizard.sound-assist", on ? "on" : "off");
    window.beeps = [];
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        state = "suspended";
        destination = {};
        get currentTime() {
          return performance.now() / 1000;
        }
        async resume() {
          this.state = "running";
        }
        createGain() {
          const param = {
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            cancelScheduledValues() {},
          };
          return { gain: param, connect() {}, disconnect() {} };
        }
        createOscillator() {
          return {
            frequency: {
              set value(hz: number) {
                window.beeps.push(hz);
              },
            },
            connect() {},
            disconnect() {},
            start() {},
            stop() {},
          };
        }
      },
    });
  }, soundAssist);
}
export async function beepsFor(page: Page, ms: number) {
  await page.evaluate(() => {
    window.beeps = [];
  });
  await page.clock.runFor(ms);
  return page.evaluate(() => window.beeps);
}
export const CHIME_HZ = [523.25, 659.25, 783.99];
