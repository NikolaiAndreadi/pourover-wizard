import { bookooUuids } from "@/scale/bookoo/codec";
import type { RecordingMetadata } from "@/scale/recording/session";
// Synthetic environment and encoding; never a device capture.
export const syntheticMetadata: RecordingMetadata = {
  model: "BOOKOO Themis Mini",
  firmware: "synthetic",
  browser: "test",
  os: "test",
  service: bookooUuids.service,
  notifyCharacteristic: bookooUuids.notify,
  commandCharacteristic: bookooUuids.command,
  encoding: { gramsUnit: 2, positiveSign: 7, negativeSign: 9 },
};
