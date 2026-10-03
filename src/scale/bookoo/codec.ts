import type { ScaleSample } from "@/core/scale";

export const bookooUuids = {
  service: "00000ffe-0000-1000-8000-00805f9b34fb",
  notify: "0000ff11-0000-1000-8000-00805f9b34fb",
  command: "0000ff12-0000-1000-8000-00805f9b34fb",
} as const;

// Numeric sign/unit codes are absent from the official Mini protocol.
// Sample conversion requires a known encoding.
export interface ConfirmedEncoding {
  gramsUnit: number;
  positiveSign: number;
  negativeSign: number;
}
// Mini profile confirmed against the physical gram display at zero and +/-12.2 g.
// Exact user-supplied notifications are preserved in hardware.fixture.ts.
export const bookooMiniEncoding: Readonly<ConfirmedEncoding> = {
  gramsUnit: 1,
  positiveSign: 0x2b,
  negativeSign: 0x2d,
};
export interface BookooFrame {
  scaleTimerMs: number;
  unitCode: number;
  signCode: number;
  magnitudeGrams: number;
  flowSignCode: number;
  flowMagnitude: number;
  batteryPercent: number;
}
export function validateEncoding(encoding: ConfirmedEncoding): void {
  if (
    !Object.values(encoding).every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 255,
    ) ||
    encoding.positiveSign === encoding.negativeSign
  ) {
    throw new Error(
      "Encoding requires byte codes and distinct positive/negative signs.",
    );
  }
}
export function toSample(
  frame: BookooFrame,
  atMs: number,
  encoding: ConfirmedEncoding,
): ScaleSample | null {
  validateEncoding(encoding);
  if (
    !Number.isFinite(atMs) ||
    atMs < 0 ||
    frame.unitCode !== encoding.gramsUnit
  )
    return null;
  const sign =
    frame.signCode === encoding.positiveSign
      ? 1
      : frame.signCode === encoding.negativeSign
        ? -1
        : null;
  return sign === null ? null : { atMs, grams: sign * frame.magnitudeGrams };
}
const commandCodes = {
  tare: 1,
  startTimer: 4,
  stopTimer: 5,
  resetTimer: 6,
} as const;
export type BookooCommand = keyof typeof commandCodes;
export function encodeCommand(command: BookooCommand): Uint8Array {
  const bytes = Uint8Array.of(3, 10, commandCodes[command], 0, 0, 0);
  bytes[5] = checksum(bytes.subarray(0, 5));
  return bytes;
}
function checksum(bytes: Uint8Array): number {
  return bytes.reduce((sum, byte) => sum ^ byte, 0);
}
function uint24(bytes: Uint8Array, index: number): number {
  return (
    (bytes[index] ?? 0) * 65536 +
    (bytes[index + 1] ?? 0) * 256 +
    (bytes[index + 2] ?? 0)
  );
}

export class BookooDecoder {
  private pending: number[] = [];
  rejectedFrames = 0;
  reset(): void {
    this.pending = [];
    this.rejectedFrames = 0;
  }
  push(chunk: Uint8Array): BookooFrame[] {
    const frames: BookooFrame[] = [];
    // Byte-wise processing keeps the resynchronization buffer bounded to 20 bytes.
    for (const byte of chunk) {
      this.pending.push(byte);
      while (
        this.pending.length >= 2 &&
        (this.pending[0] !== 3 || this.pending[1] !== 11)
      )
        this.pending.shift();
      if (this.pending.length < 20) continue;
      const bytes = Uint8Array.from(this.pending);
      if (checksum(bytes) !== 0) {
        this.rejectedFrames++;
        this.pending.shift();
        continue;
      }
      frames.push({
        scaleTimerMs: uint24(bytes, 2),
        unitCode: bytes[5] ?? 0,
        signCode: bytes[6] ?? 0,
        magnitudeGrams: uint24(bytes, 7) / 100,
        flowSignCode: bytes[10] ?? 0,
        flowMagnitude: ((bytes[11] ?? 0) * 256 + (bytes[12] ?? 0)) / 100,
        batteryPercent: bytes[13] ?? 0,
      });
      this.pending = [];
    }
    return frames;
  }
}
