import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import HSlider from "./HSlider.vue";

const base = { modelValue: 12, min: 0, max: 31, label: "Sidetone" };

describe("HSlider", () => {
  it("exposes a labelled range input carrying the bounds it was given", () => {
    const input = mount(HSlider, { props: { ...base, step: 2 } }).get("input");

    expect(input.attributes("type")).toBe("range");
    expect(input.attributes("aria-label")).toBe("Sidetone");
    expect(input.attributes("min")).toBe("0");
    expect(input.attributes("max")).toBe("31");
    expect(input.attributes("step")).toBe("2");
    expect((input.element as HTMLInputElement).value).toBe("12");
  });

  it("emits the new position as a number, not as the input's string", async () => {
    const wrapper = mount(HSlider, { props: base });

    await wrapper.get("input").setValue("20");

    expect(wrapper.emitted("update:modelValue")).toEqual([[20]]);
  });

  it("fills the line up to the current position", () => {
    const wrapper = mount(HSlider, { props: { ...base, min: 0, max: 20, modelValue: 5 } });

    expect(wrapper.get('[data-part="fill"]').attributes("style")).toContain("width: 25%");
  });

  it("marks the middle instead of filling when the value is a balance", () => {
    const wrapper = mount(HSlider, { props: { ...base, variant: "center" } });

    expect(wrapper.find('[data-part="center-tick"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="fill"]').exists()).toBe(false);
  });

  it("keeps the fill inside the track when min and max collapse", () => {
    const wrapper = mount(HSlider, { props: { ...base, min: 5, max: 5, modelValue: 5 } });

    expect(wrapper.get('[data-part="fill"]').attributes("style")).toContain("width: 0%");
  });
});
