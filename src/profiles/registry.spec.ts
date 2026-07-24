import { afterEach, describe, expect, it } from "vitest";

import { MAXWELL2_XBOX } from "../core/mock-backend";
import { GENERIC_PROFILE } from "./generic";
import { PROFILES, platformFor, profileFor, profileKey } from "./registry";
import type { DeviceProfile } from "./types";

/** One model, two dongles that differ only in their product id. */
const XBOX_PID = 0x4b28;
const PS_PID = 0x4b27;
const VENDOR = 0x3329;

const TWO_VARIANTS: DeviceProfile = {
  variants: { [XBOX_PID]: "xbox", [PS_PID]: "ps" },
};

function register(productId: number, profile: DeviceProfile): void {
  PROFILES[profileKey({ vendorId: VENDOR, productId })] = profile;
}

describe("the profile registry", () => {
  afterEach(() => {
    for (const key of Object.keys(PROFILES)) {
      delete PROFILES[key];
    }
  });

  it("keys profiles the way the CLI reports ids", () => {
    expect(profileKey({ vendorId: VENDOR, productId: XBOX_PID })).toBe("3329:4b28");
  });

  it("pads a short id, so a lookup never depends on formatting", () => {
    expect(profileKey({ vendorId: 0x1b, productId: 0x2 })).toBe("001b:0002");
  });

  it("falls back to the generic profile for a headset it has never seen", () => {
    expect(profileFor(MAXWELL2_XBOX)).toBe(GENERIC_PROFILE);
  });

  it("hands out the profile registered for a device", () => {
    register(XBOX_PID, TWO_VARIANTS);

    expect(profileFor({ vendorId: VENDOR, productId: XBOX_PID })).toBe(TWO_VARIANTS);
  });

  it("supports a new headset with one entry and no edit anywhere else", () => {
    const brandNew: DeviceProfile = { variants: { 0x1234: "nintendo" } };
    PROFILES[profileKey({ vendorId: 0x9999, productId: 0x1234 })] = brandNew;

    expect(platformFor({ vendorId: 0x9999, productId: 0x1234 })).toBe("nintendo");
  });
});

describe("resolving the platform", () => {
  afterEach(() => {
    for (const key of Object.keys(PROFILES)) {
      delete PROFILES[key];
    }
  });

  it("themes the same model differently per variant, with no component knowing", () => {
    register(XBOX_PID, TWO_VARIANTS);
    register(PS_PID, TWO_VARIANTS);

    expect(platformFor({ vendorId: VENDOR, productId: XBOX_PID })).toBe("xbox");
    expect(platformFor({ vendorId: VENDOR, productId: PS_PID })).toBe("ps");
  });

  it("stays neutral for a headset with no profile", () => {
    expect(platformFor(MAXWELL2_XBOX)).toBeNull();
  });

  it("stays neutral for a profile that has no variants at all", () => {
    register(XBOX_PID, {});

    expect(platformFor({ vendorId: VENDOR, productId: XBOX_PID })).toBeNull();
  });

  it("stays neutral for a product id the profile does not map", () => {
    register(0x9999, TWO_VARIANTS);

    expect(platformFor({ vendorId: VENDOR, productId: 0x9999 })).toBeNull();
  });
});
