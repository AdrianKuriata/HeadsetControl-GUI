import type { Device } from "../core/types.gen";

/**
 * The platforms a headset can be sold for. Three have an accent colour
 * (`docs/architecture/design-system.md`); `pc` has none and renders neutral,
 * like a device with no profile at all.
 */
export type Platform = "xbox" | "ps" | "nintendo" | "pc";

/**
 * What the app knows about a headset model that the CLI cannot tell it.
 *
 * Every field is optional on purpose (ISP): a profile declares only what it
 * overrides, and a model with nothing special needs no profile at all. Rust is
 * forbidden this knowledge — it deals in capabilities and values only
 * (PROJECT.md §3.1).
 */
export interface DeviceProfile {
  /**
   * Which platform each product id is the variant for. The same model is often
   * sold as separate dongles that differ *only* in their PID, which is exactly
   * what decides the accent colour.
   */
  variants?: Readonly<Record<number, Platform>>;
}

/** How a profile is looked up: the pair the device reports. */
export type DeviceKey = Pick<Device, "vendorId" | "productId">;
