import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import { MAXWELL2_XBOX } from "../core/mock-backend";
import type { AppState } from "../core/state-machine";
import { SCREENS, screenProps } from "./registry";

const STATES: AppState[] = [
  { kind: "checking-binary" },
  { kind: "missing-binary" },
  { kind: "bad-version", found: "2.5.0", required: "3.0.0" },
  { kind: "no-permissions" },
  { kind: "no-device" },
  { kind: "ready", device: MAXWELL2_XBOX },
  { kind: "device-lost", device: MAXWELL2_XBOX },
];

describe("the screen registry", () => {
  it.each(STATES)("renders $kind with the props that state carries", (state) => {
    const screen = mount(SCREENS[state.kind], { props: screenProps(state) });

    expect(screen.find("section").exists()).toBe(true);
  });

  it("hands the device to the screens that show one", () => {
    expect(screenProps({ kind: "ready", device: MAXWELL2_XBOX })).toEqual({
      device: MAXWELL2_XBOX,
    });
    expect(screenProps({ kind: "device-lost", device: MAXWELL2_XBOX })).toEqual({
      device: MAXWELL2_XBOX,
    });
  });

  it("hands both versions to the bad-version screen", () => {
    expect(screenProps({ kind: "bad-version", found: "2.5.0", required: "3.0.0" })).toEqual({
      found: "2.5.0",
      required: "3.0.0",
    });
  });

  it("hands nothing to the screens that need nothing", () => {
    expect(screenProps({ kind: "checking-binary" })).toEqual({});
  });
});
