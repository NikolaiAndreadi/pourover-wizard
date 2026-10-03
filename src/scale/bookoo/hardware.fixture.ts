// Actual notifications supplied by the user on October 3, 2026.
// Physical display: zero; -12.2/-12.3 g after removing the rubber cover;
// +12.2 g for the positive capture. Every supplied negative frame is -12.20 g;
// no -12.30 g packet was supplied. OS/browser/firmware versions are unknown.
export const hardwareNotifications = {
  zero: [
    "03 0b 00 00 00 01 2b 00 00 00 2d 00 02 64 00 96 05 01 01 fa",
    "03 0b 00 00 00 01 2b 00 00 00 2d 00 03 64 00 96 05 01 01 fb",
    "03 0b 00 00 00 01 2b 00 00 00 2b 00 05 64 00 96 05 01 01 fb",
    "03 0b 00 00 00 01 2b 00 00 00 2b 00 02 64 00 96 05 01 01 fc",
  ],
  negative: [
    "03 0b 00 00 00 01 2d 00 04 c4 2b 00 05 64 00 96 05 01 01 3d",
    "03 0b 00 00 00 01 2d 00 04 c4 2d 00 02 64 00 96 05 01 01 3c",
    "03 0b 00 00 00 01 2d 00 04 c4 2d 00 04 64 00 96 05 01 01 3a",
    "03 0b 00 00 00 01 2d 00 04 c4 2b 00 03 64 00 96 05 01 01 3b",
    "03 0b 00 00 00 01 2d 00 04 c4 2d 00 03 64 00 96 05 01 01 3d",
  ],
  positive: [
    "03 0b 00 00 00 01 2b 00 04 c4 2d 00 04 64 00 96 05 01 01 3c",
    "03 0b 00 00 00 01 2b 00 04 c4 2d 00 04 64 00 96 05 01 01 3c",
    "03 0b 00 00 00 01 2b 00 04 c4 2b 00 03 64 00 96 05 01 01 3d",
  ],
} as const;
