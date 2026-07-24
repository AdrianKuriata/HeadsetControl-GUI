import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import HStepper from "./HStepper.vue";

const base = { decrementLabel: "Shorter", incrementLabel: "Longer" };

function mountStepper(props: Partial<typeof base> & Record<string, unknown> = {}) {
  return mount(HStepper, { props: { ...base, ...props }, slots: { default: "30 min" } });
}

describe("HStepper", () => {
  it("shows the value its parent formatted, between two labelled buttons", () => {
    const wrapper = mountStepper();
    const [minus, plus] = wrapper.findAll("button");

    expect(minus.attributes("aria-label")).toBe("Shorter");
    expect(plus.attributes("aria-label")).toBe("Longer");
    expect(wrapper.get('[data-part="value"]').text()).toBe("30 min");
  });

  it("steps down and up", async () => {
    const wrapper = mountStepper();
    const [minus, plus] = wrapper.findAll("button");

    await minus.trigger("click");
    await plus.trigger("click");

    expect(wrapper.emitted("step")).toEqual([[-1], [1]]);
  });

  it("disables the end it cannot move past", async () => {
    const wrapper = mountStepper({ atMin: true });
    const [minus, plus] = wrapper.findAll("button");

    expect(minus.attributes("disabled")).toBeDefined();
    expect(plus.attributes("disabled")).toBeUndefined();

    await minus.trigger("click");

    expect(wrapper.emitted("step")).toBeUndefined();
  });

  it("disables the upper end at the top of the range", () => {
    const [, plus] = mountStepper({ atMax: true }).findAll("button");

    expect(plus.attributes("disabled")).toBeDefined();
  });
});
