import type { Page } from "@playwright/test";

declare global {
  interface Window {
    beeps: number[];
  }
}
/**
 * Turns Sound Assist on and replaces AudioContext with one that records the
 * frequency of every note on window.beeps, timed by the page clock.
 */
export async function installFakeAudio(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("pourover-wizard.sound-assist", "on");
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
  });
}
/** Clears window.beeps, runs the page clock, and returns what played. */
export async function beepsFor(page: Page, ms: number) {
  await page.evaluate(() => {
    window.beeps = [];
  });
  await page.clock.runFor(ms);
  return page.evaluate(() => window.beeps);
}
export const STOP_CHIME_HZ = [523.25, 659.25, 783.99];
