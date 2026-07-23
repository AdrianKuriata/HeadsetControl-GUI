import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import { MAXWELL2_XBOX } from "../core/mock-backend";
import BadVersionScreen from "./BadVersionScreen.vue";
import CheckingBinaryScreen from "./CheckingBinaryScreen.vue";
import DeviceLostScreen from "./DeviceLostScreen.vue";
import MissingBinaryScreen from "./MissingBinaryScreen.vue";
import NoDeviceScreen from "./NoDeviceScreen.vue";
import NoPermissionsScreen from "./NoPermissionsScreen.vue";
import ReadyScreen from "./ReadyScreen.vue";

describe("screens that wait", () => {
  it("marks the startup probe as busy for assistive technology", () => {
    expect(mount(CheckingBinaryScreen).attributes("aria-busy")).toBe("true");
  });

  it("tells the user hotplug will pick the headset up by itself", () => {
    const screen = mount(NoDeviceScreen);

    expect(screen.text()).toContain("No headset connected");
    expect(screen.find("button").exists()).toBe(false);
  });
});

describe("screens that offer a retry", () => {
  it("emits retry from the missing-binary screen", async () => {
    const screen = mount(MissingBinaryScreen);

    await screen.get("button").trigger("click");

    expect(screen.emitted("retry")).toHaveLength(1);
  });

  it("emits retry from the bad-version screen, naming both versions", async () => {
    const screen = mount(BadVersionScreen, { props: { found: "2.5.0", required: "3.0.0" } });

    expect(screen.text()).toContain("2.5.0");
    expect(screen.text()).toContain("3.0.0");

    await screen.get("button").trigger("click");

    expect(screen.emitted("retry")).toHaveLength(1);
  });

  it("emits retry from the no-permissions screen, showing a udev rule to copy", async () => {
    const screen = mount(NoPermissionsScreen);

    expect(screen.get("pre").text()).toContain('KERNEL=="hidraw*"');

    await screen.get("button").trigger("click");

    expect(screen.emitted("retry")).toHaveLength(1);
  });
});

describe("device screens", () => {
  it("lists every capability the device reports", () => {
    const screen = mount(ReadyScreen, { props: { device: MAXWELL2_XBOX } });

    expect(screen.text()).toContain(MAXWELL2_XBOX.name);
    expect(screen.findAll("li")).toHaveLength(MAXWELL2_XBOX.capabilities.length);
  });

  it("renders an unknown capability instead of failing on it", () => {
    const device = { ...MAXWELL2_XBOX, capabilities: ["CAP_FROM_THE_FUTURE"] };

    expect(mount(ReadyScreen, { props: { device } }).text()).toContain("CAP_FROM_THE_FUTURE");
  });

  it("dims the last known values when the device is lost", () => {
    const screen = mount(DeviceLostScreen, { props: { device: MAXWELL2_XBOX } });

    expect(screen.get("section").classes()).toContain("screen--dimmed");
    expect(screen.text()).toContain("Connection lost");
  });
});
