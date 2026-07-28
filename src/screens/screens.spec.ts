import { describe, expect, it, vi } from "vitest";

import { MAXWELL2_XBOX } from "../core/mock-backend";
import { PROFILES, profileKey } from "../profiles/registry";
import { mountWithI18n } from "../test-support";
import BadVersionScreen from "./BadVersionScreen.vue";
import CheckingBinaryScreen from "./CheckingBinaryScreen.vue";
import DeviceLostScreen from "./DeviceLostScreen.vue";
import MissingBinaryScreen from "./MissingBinaryScreen.vue";
import NoDeviceScreen from "./NoDeviceScreen.vue";
import NoPermissionsScreen from "./NoPermissionsScreen.vue";
import ReadyScreen from "./ReadyScreen.vue";

describe("screens that wait", () => {
  it("marks the startup probe as busy for assistive technology", () => {
    expect(mountWithI18n(CheckingBinaryScreen).wrapper.attributes("aria-busy")).toBe("true");
  });

  it("tells the user hotplug will pick the headset up by itself", () => {
    const { wrapper } = mountWithI18n(NoDeviceScreen);

    expect(wrapper.text()).toContain("No headset connected");
    expect(wrapper.find("button").exists()).toBe(false);
  });
});

describe("screens that offer a retry", () => {
  it("emits retry from the missing-binary screen, naming the CLI it wraps", async () => {
    const { wrapper } = mountWithI18n(MissingBinaryScreen);

    expect(wrapper.get("code").text()).toBe("headsetcontrol");

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("retry")).toHaveLength(1);
  });

  it("emits retry from the bad-version screen, naming both versions", async () => {
    const { wrapper } = mountWithI18n(BadVersionScreen, {
      props: { found: "2.5.0", required: "3.0.0" },
    });

    expect(wrapper.text()).toContain("2.5.0");
    expect(wrapper.text()).toContain("3.0.0");

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("retry")).toHaveLength(1);
  });

  it("names no version on the bad-version screen when the binary named none", () => {
    const { wrapper } = mountWithI18n(BadVersionScreen, {
      props: { found: null, required: "4.0.0" },
    });

    expect(wrapper.get("[data-part='body']").text()).toContain("could not be read");
    expect(wrapper.text()).toContain("4.0.0");
  });

  it("offers the signed packages first on both screens that have no usable binary", () => {
    for (const screen of [MissingBinaryScreen, BadVersionScreen]) {
      const { wrapper } = mountWithI18n(screen, {
        props: { found: "2.5.0", required: "4.0.0" },
      });
      const instructions = wrapper.get("[data-part='install-instructions']").text();

      // Where the packages come from, how to check the signature, then one
      // install command per format upstream ships.
      expect(instructions).toContain("https://github.com/Sapd/HeadsetControl/releases/latest");
      expect(instructions).toContain("gpg --verify");
      expect(instructions).toContain("sudo apt install ./headsetcontrol_");
      expect(instructions).toContain("sudo dnf install ./headsetcontrol-");
      expect(instructions).toContain("chmod +x headsetcontrol-x86_64.AppImage");
    }
  });

  it("keeps the source build on offer, for distributions upstream packages nothing for", () => {
    const { wrapper } = mountWithI18n(MissingBinaryScreen);
    const instructions = wrapper.get("[data-part='install-instructions']").text();

    expect(instructions).toContain("sudo apt install build-essential");
    expect(instructions).toContain("sudo dnf install g++");
    expect(instructions).toContain("sudo pacman -S base-devel");
    expect(instructions).toContain("git clone https://github.com/Sapd/HeadsetControl");
    expect(instructions).toContain("sudo make install");
  });

  it("names no version anywhere in the install commands", () => {
    // A pinned version rots at the next upstream tag: the release page always
    // points at the newest, and the globs keep matching whatever was downloaded.
    const { wrapper } = mountWithI18n(MissingBinaryScreen);

    expect(wrapper.get("[data-part='install-instructions']").text()).not.toMatch(/\d+\.\d+\.\d+/);
  });

  it("emits retry from the no-permissions screen, showing the udev rules to copy", async () => {
    const { wrapper } = mountWithI18n(NoPermissionsScreen);
    const commands = wrapper.get("[data-part='udev-rule']").text();

    // Upstream's own generator, not a hand-written hidraw catch-all.
    expect(commands).toContain("headsetcontrol -u | sudo tee /etc/udev/rules.d/70-headsets.rules");
    expect(commands).toContain("sudo udevadm control --reload-rules");

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("retry")).toHaveLength(1);
  });
});

describe("device screens", () => {
  it("renders one row per capability the device reports", () => {
    const { wrapper } = mountWithI18n(ReadyScreen, { props: { device: MAXWELL2_XBOX } });

    expect(wrapper.text()).toContain(MAXWELL2_XBOX.name);
    // Every reported capability but the battery, which the header shows.
    expect(wrapper.findAll('[data-part="row"]')).toHaveLength(
      MAXWELL2_XBOX.capabilities.length - 1,
    );
  });

  it("renders exactly the rows a smaller device reports", () => {
    const device = { ...MAXWELL2_XBOX, capabilities: ["CAP_SIDETONE", "CAP_LIGHTS"] };

    const { wrapper } = mountWithI18n(ReadyScreen, { props: { device } });

    expect(
      wrapper.findAll("[data-capability]").map((row) => row.attributes("data-capability")),
    ).toEqual(["CAP_SIDETONE", "CAP_LIGHTS"]);
  });

  it("skips a capability this build cannot render instead of failing on it", () => {
    const logged = vi.spyOn(console, "info").mockImplementation(() => {});
    const device = { ...MAXWELL2_XBOX, capabilities: ["CAP_FROM_THE_FUTURE", "CAP_SIDETONE"] };

    const { wrapper } = mountWithI18n(ReadyScreen, { props: { device } });

    expect(wrapper.findAll('[data-part="row"]')).toHaveLength(1);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("hands a row the value written for its capability, and reports the next one", async () => {
    const device = { ...MAXWELL2_XBOX, capabilities: ["CAP_SIDETONE"] };
    const { wrapper } = mountWithI18n(ReadyScreen, {
      props: { device, params: { CAP_SIDETONE: { kind: "int", value: 40 } } },
    });

    expect(wrapper.text()).toContain("40");

    await wrapper.get("input").setValue(72);

    expect(wrapper.emitted("write")).toEqual([["CAP_SIDETONE", { kind: "int", value: 72 }]]);
  });

  it.each([
    { readings: undefined, shows: "Not reporting", when: "nothing has been read yet" },
    {
      readings: { battery: { status: "available", level: 71 }, chatmix: null },
      shows: "71%",
      when: "the battery reports a level",
    },
    {
      readings: { battery: { status: "charging", level: 40 }, chatmix: null },
      shows: "Charging 40%",
      when: "the headset is on the charger",
    },
    {
      readings: { battery: { status: "charging", level: null }, chatmix: null },
      shows: "Charging",
      when: "it charges without saying how far along",
    },
    {
      readings: { battery: { status: "unavailable", level: null }, chatmix: null },
      shows: "Not reporting",
      when: "the headset is off",
    },
    {
      readings: { battery: null, chatmix: 64 },
      shows: "Not reporting",
      when: "the device has no battery to report",
    },
  ] as const)("shows the battery when $when", ({ readings, shows }) => {
    const { wrapper } = mountWithI18n(ReadyScreen, {
      props: { device: MAXWELL2_XBOX, readings },
    });

    expect(wrapper.get('[data-part="battery"]').text()).toBe(shows);
  });

  it("badges the platform a device is the variant for", () => {
    PROFILES[profileKey(MAXWELL2_XBOX)] = { variants: { [MAXWELL2_XBOX.productId]: "xbox" } };

    try {
      const { wrapper } = mountWithI18n(ReadyScreen, { props: { device: MAXWELL2_XBOX } });

      expect(wrapper.get('[data-part="platform"]').text()).toBe("Xbox");
    } finally {
      delete PROFILES[profileKey(MAXWELL2_XBOX)];
    }
  });

  it("shows no badge for a headset whose platform nothing states", () => {
    const { wrapper } = mountWithI18n(ReadyScreen, { props: { device: MAXWELL2_XBOX } });

    expect(wrapper.find('[data-part="platform"]').exists()).toBe(false);
  });

  it("dims the last known values when the device is lost", () => {
    const { wrapper } = mountWithI18n(DeviceLostScreen, { props: { device: MAXWELL2_XBOX } });

    expect(wrapper.get("section").classes()).toContain("opacity-50");
    expect(wrapper.text()).toContain("Connection lost");
  });
});

describe("live locale switching", () => {
  it("re-renders every visible string when the locale changes", async () => {
    const { wrapper, i18n } = mountWithI18n(NoDeviceScreen);
    expect(wrapper.text()).toContain("No headset connected");

    i18n.global.locale.value = "pl";
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("Nie podłączono zestawu słuchawkowego");
    expect(wrapper.text()).not.toContain("No headset connected");
  });

  it("interpolates markup in translated sentences after a switch", async () => {
    const { wrapper, i18n } = mountWithI18n(MissingBinaryScreen);

    i18n.global.locale.value = "pl";
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("graficzna nakładka");
    expect(wrapper.get("code").text()).toBe("headsetcontrol");
  });
});
