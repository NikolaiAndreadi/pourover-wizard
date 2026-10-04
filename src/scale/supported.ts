import { bookooUuids } from "@/scale/bookoo/codec";

/** Wire protocols the app can decode; each selects a codec in `app/`. */
export type ScaleProtocol = "bookoo-mini";
export interface ScaleModel {
  id: string;
  brand: string;
  model: string;
  /** Advertised name prefixes; empty when the vendor documents none. */
  namePrefixes: readonly string[];
  service: string;
  notify: string;
  command: string;
  protocol: ScaleProtocol;
  /** True only when a physical device confirmed the identification and decoding. */
  verified: boolean;
  /** What was observed on hardware versus what is only documented. */
  note: string;
}
const BASE_UUID_SUFFIX = "-0000-1000-8000-00805f9b34fb";
/** Expands 16- and 32-bit UUID forms to the lower-case 128-bit Bluetooth base UUID form. */
export function canonicalUuid(uuid: string): string {
  const value = uuid.trim().toLowerCase().replace(/^0x/, "");
  if (/^[0-9a-f]{4}$/.test(value)) return `0000${value}${BASE_UUID_SUFFIX}`;
  if (/^[0-9a-f]{8}$/.test(value)) return `${value}${BASE_UUID_SUFFIX}`;
  return value;
}
/**
 * Supported scales as data. Transports build chooser filters from this list and
 * select the service and characteristic UUIDs of the model they identify.
 * Sources: the vendor's open repository at commit 6e3f48a
 * (https://github.com/BooKooCode/OpenSource/tree/6e3f48a81aa7b209871517cf7cda19399d8a16ba).
 */
export const supportedScales: readonly ScaleModel[] = [
  {
    id: "bookoo-themis-mini",
    brand: "BOOKOO",
    model: "Themis Mini",
    namePrefixes: ["BOOKOO_SC"],
    service: bookooUuids.service,
    notify: bookooUuids.notify,
    command: bookooUuids.command,
    protocol: "bookoo-mini",
    verified: true,
    note:
      "Observed: name prefix BOOKOO_SC in Chrome's chooser; service 0x0FFE with " +
      "notify 0xFF11 and command 0xFF12 per bookoo_mini_scale/protocols.md; " +
      "gram and sign decoding confirmed against the display at zero and ±12.2 g.",
  },
  {
    id: "bookoo-ultra",
    brand: "BOOKOO",
    model: "Ultra Scale",
    namePrefixes: [],
    service: bookooUuids.service,
    notify: bookooUuids.notify,
    command: bookooUuids.command,
    protocol: "bookoo-mini",
    verified: false,
    note:
      "Documented only: bookoo_ultra_scale/protocols.md (last update September 18, 2026) " +
      "lists the same service 0x0FFE, characteristics 0xFF11/0xFF12, 03 0B weight frame, " +
      "tare command and XOR checksum as the Mini. No advertised name is documented, and " +
      "the shared service means a device without the Mini's name prefix is reported as " +
      "this model only when its name does not match the Mini. Untested on hardware.",
  },
];
const unique = (values: readonly string[]) => [...new Set(values)];
/** Every documented name prefix across supported models. */
export function namePrefixes(): string[] {
  return unique(supportedScales.flatMap((model) => model.namePrefixes));
}
/** Every service the app may need to access after connecting. */
export function optionalServices(): string[] {
  return unique(supportedScales.map((model) => model.service));
}
export type RequestFilter = { services: string[] } | { namePrefix: string };
/** ORed Web Bluetooth filters: any supported service, or any documented name prefix. */
export function requestFilters(): RequestFilter[] {
  return [
    ...optionalServices().map((service) => ({ services: [service] })),
    ...namePrefixes().map((namePrefix) => ({ namePrefix })),
  ];
}
const hasPrefix = (model: ScaleModel, name: string | undefined) =>
  name !== undefined &&
  model.namePrefixes.some((prefix) => name.startsWith(prefix));
/**
 * The first model whose service the connected device exposes, in any UUID form.
 * Models sharing a service are told apart by the device name when it matches a
 * documented prefix; otherwise the first registered model wins.
 */
export function identify(
  services: readonly string[],
  name?: string,
): ScaleModel | null {
  const exposed = new Set(services.map(canonicalUuid));
  const matching = supportedScales.filter((model) =>
    exposed.has(canonicalUuid(model.service)),
  );
  return (
    matching.find((model) => hasPrefix(model, name)) ?? matching[0] ?? null
  );
}
/** Human-readable model name, such as "BOOKOO Themis Mini". */
export function modelName(model: ScaleModel): string {
  return `${model.brand} ${model.model}`;
}
