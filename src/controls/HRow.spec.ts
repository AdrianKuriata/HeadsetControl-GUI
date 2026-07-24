import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import HRow from "./HRow.vue";

describe("HRow", () => {
  it("lays out the name, the control and the value it is given", () => {
    const wrapper = mount(HRow, {
      props: { name: "Sidetone" },
      slots: { default: "<input>", value: "64" },
    });

    expect(wrapper.text()).toContain("Sidetone");
    expect(wrapper.find("input").exists()).toBe(true);
    expect(wrapper.text()).toContain("64");
  });

  it("explains the name when there is more to say", () => {
    const wrapper = mount(HRow, {
      props: { name: "Sidetone", description: "Hearing your own voice" },
    });

    expect(wrapper.get('[data-part="description"]').text()).toBe("Hearing your own voice");
  });

  it("leaves out the explanation when the name says it all", () => {
    const wrapper = mount(HRow, { props: { name: "Voice prompts" } });

    expect(wrapper.find('[data-part="description"]').exists()).toBe(false);
  });
});
