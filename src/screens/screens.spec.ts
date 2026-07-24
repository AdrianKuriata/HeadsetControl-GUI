import { describe, expect, it } from "vitest";

import { MAXWELL2_XBOX } from "../core/mock-backend";
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

  it("emits retry from the no-permissions screen, showing a udev rule to copy", async () => {
    const { wrapper } = mountWithI18n(NoPermissionsScreen);

    expect(wrapper.get("pre").text()).toContain('KERNEL=="hidraw*"');

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("retry")).toHaveLength(1);
  });
});

describe("device screens", () => {
  it("lists every capability the device reports", () => {
    const { wrapper } = mountWithI18n(ReadyScreen, { props: { device: MAXWELL2_XBOX } });

    expect(wrapper.text()).toContain(MAXWELL2_XBOX.name);
    expect(wrapper.findAll("li")).toHaveLength(MAXWELL2_XBOX.capabilities.length);
  });

  it("renders an unknown capability instead of failing on it", () => {
    const device = { ...MAXWELL2_XBOX, capabilities: ["CAP_FROM_THE_FUTURE"] };

    expect(mountWithI18n(ReadyScreen, { props: { device } }).wrapper.text()).toContain(
      "CAP_FROM_THE_FUTURE",
    );
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
