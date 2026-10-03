// Synthetic protocol construction, never a real scale capture.
export function syntheticFrame({
  magnitude = 12345,
  sign = 7,
  unit = 2,
  timer = 66051,
}: {
  magnitude?: number;
  sign?: number;
  unit?: number;
  timer?: number;
} = {}): Uint8Array {
  const bytes = Uint8Array.of(
    3,
    11,
    timer >>> 16,
    (timer >>> 8) & 255,
    timer & 255,
    unit,
    sign,
    magnitude >>> 16,
    (magnitude >>> 8) & 255,
    magnitude & 255,
    9,
    0,
    200,
    100,
    0,
    50,
    1,
    0,
    0,
    0,
  );
  bytes[19] = bytes.subarray(0, 19).reduce((sum, byte) => sum ^ byte, 0);
  return bytes;
}
