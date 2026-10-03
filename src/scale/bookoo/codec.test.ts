import { describe, expect, it } from "vitest";
import {
  BookooDecoder,
  encodeCommand,
  toSample,
  validateEncoding,
} from "@/scale/bookoo/codec";
import { syntheticFrame } from "@/scale/bookoo/synthetic.fixture";

const encoding = { gramsUnit: 2, positiveSign: 7, negativeSign: 9 };
describe("synthetic BOOKOO protocol fixtures; hardware encoding remains unverified", () => {
  it("decodes big-endian timer, signed weight through confirmed mapping, and independent fields", () => {
    const decoder = new BookooDecoder();
    const [positive, negative] = decoder.push(
      Uint8Array.from([
        ...syntheticFrame(),
        ...syntheticFrame({ magnitude: 65537, sign: 9, timer: 16777215 }),
      ]),
    );
    expect(positive).toEqual({
      scaleTimerMs: 66051,
      unitCode: 2,
      signCode: 7,
      magnitudeGrams: 123.45,
      flowSignCode: 9,
      flowMagnitude: 2,
      batteryPercent: 100,
    });
    expect(negative?.scaleTimerMs).toBe(16777215);
    expect(toSample(positive!, 100, encoding)).toEqual({
      atMs: 100,
      grams: 123.45,
    });
    expect(toSample(negative!, 101, encoding)).toEqual({
      atMs: 101,
      grams: -655.37,
    });
  });
  it("preserves fragmented frames and resynchronizes after garbage and corrupt checksum", () => {
    const decoder = new BookooDecoder();
    const frame = syntheticFrame();
    const bad = frame.slice();
    bad[19] = (bad[19] ?? 0) ^ 1;
    expect(decoder.push(Uint8Array.of(3, 99, 42))).toEqual([]);
    expect(decoder.push(frame.subarray(0, 4))).toEqual([]);
    expect(decoder.push(frame.subarray(4, 19))).toEqual([]);
    expect(
      decoder.push(Uint8Array.from([frame[19]!, ...bad, ...frame])),
    ).toHaveLength(2);
    expect(decoder.rejectedFrames).toBe(1);
  });
  it("does not guess units/signs and discards pending fragments on reset", () => {
    const decoder = new BookooDecoder();
    const frame = syntheticFrame();
    decoder.push(frame.subarray(0, 10));
    decoder.reset();
    expect(decoder.push(frame.subarray(10))).toEqual([]);
    const raw = decoder.push(frame)[0]!;
    expect(toSample({ ...raw, unitCode: 99 }, 1, encoding)).toBeNull();
    expect(toSample({ ...raw, signCode: 99 }, 1, encoding)).toBeNull();
    expect(toSample(raw, NaN, encoding)).toBeNull();
    expect(() => validateEncoding({ ...encoding, negativeSign: 7 })).toThrow();
  });
  it.each(["gramsUnit", "positiveSign", "negativeSign"] as const)(
    "requires %s to be an integer byte",
    (field) => {
      for (const invalid of [-1, 256, 1.5, NaN, Infinity, -Infinity]) {
        expect(() =>
          validateEncoding({ ...encoding, [field]: invalid }),
        ).toThrow();
      }
    },
  );
  it("accepts exact zero and maximum byte codes with distinct signs", () => {
    expect(() =>
      validateEncoding({ gramsUnit: 0, positiveSign: 0, negativeSign: 255 }),
    ).not.toThrow();
    expect(() =>
      validateEncoding({ gramsUnit: 255, positiveSign: 255, negativeSign: 0 }),
    ).not.toThrow();
  });
  it("validates confirmed encoding at the sample boundary", () => {
    const frame = new BookooDecoder().push(syntheticFrame())[0]!;
    expect(() => toSample(frame, 0, { ...encoding, gramsUnit: 2.5 })).toThrow();
    expect(() =>
      toSample(frame, 0, { ...encoding, negativeSign: encoding.positiveSign }),
    ).toThrow();
  });
  it("accepts a receipt at the clock origin and rejects negative relative time", () => {
    const frame = new BookooDecoder().push(syntheticFrame())[0]!;
    expect(toSample(frame, 0, encoding)).toEqual({ atMs: 0, grams: 123.45 });
    expect(toSample(frame, -0.01, encoding)).toBeNull();
  });
  it("decodes both bytes of a nonzero 16-bit flow magnitude", () => {
    // Independent synthetic frame: flow bytes 0x01 0x2c encode 300 / 100.
    // The final XOR byte 0x77 was calculated independently of the decoder.
    const bytes = Uint8Array.of(
      0x03,
      0x0b,
      0x01,
      0x02,
      0x03,
      0x02,
      0x07,
      0x00,
      0x30,
      0x39,
      0x09,
      0x01,
      0x2c,
      0x64,
      0x00,
      0x32,
      0x01,
      0x00,
      0x00,
      0x77,
    );
    const decoded = new BookooDecoder().push(bytes);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]?.flowMagnitude).toBe(3);
  });
  it("rejects checksum-valid frames with either wrong header byte and recovers", () => {
    // Synthetic payload and independently computed XORs: valid header 0x03/0x0b
    // has checksum 0x77; changing either header as below gives checksum 0x70.
    const payload = [
      0x01, 0x02, 0x03, 0x02, 0x07, 0x00, 0x30, 0x39, 0x09, 0x01, 0x2c, 0x64,
      0x00, 0x32, 0x01, 0x00, 0x00,
    ];
    const valid = Uint8Array.of(0x03, 0x0b, ...payload, 0x77);
    for (const invalid of [
      Uint8Array.of(0x04, 0x0b, ...payload, 0x70),
      Uint8Array.of(0x03, 0x0c, ...payload, 0x70),
    ]) {
      const decoder = new BookooDecoder();
      expect(decoder.push(invalid)).toEqual([]);
      expect(decoder.push(valid)).toHaveLength(1);
    }
  });
  it.each([
    ["tare", [3, 10, 1, 0, 0, 8]],
    ["startTimer", [3, 10, 4, 0, 0, 13]],
    ["stopTimer", [3, 10, 5, 0, 0, 12]],
    ["resetTimer", [3, 10, 6, 0, 0, 15]],
  ] as const)(
    "encodes %s against independent command bytes",
    (command, expected) => {
      expect(Array.from(encodeCommand(command))).toEqual(expected);
    },
  );
});
