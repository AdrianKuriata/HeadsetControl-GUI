import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import HReadout from "./HReadout.vue";

describe("HReadout", () => {
  it("renders the value it is given", () => {
    expect(mount(HReadout, { slots: { default: "12" } }).text()).toBe("12");
  });

  it("renders an optional suffix dimmed next to the value", () => {
    const wrapper = mount(HReadout, { slots: { default: "12", suffix: " / 31" } });

    expect(wrapper.get('[data-part="suffix"]').text()).toBe("/ 31");
    expect(wrapper.text()).toContain("12");
  });

  it("leaves out the suffix element when nothing fills the slot", () => {
    expect(
      mount(HReadout, { slots: { default: "—" } })
        .find('[data-part="suffix"]')
        .exists(),
    ).toBe(false);
  });
});
