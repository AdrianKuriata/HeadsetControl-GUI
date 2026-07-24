import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import HOptions from "./HOptions.vue";

const options = [
  { value: 0, label: "off" },
  { value: 1, label: "low" },
  { value: 2, label: "high" },
];

function mountOptions(modelValue: number | string = 1) {
  return mount(HOptions, {
    props: { modelValue, options, label: "Noise filter" },
    attachTo: document.body,
  });
}

describe("HOptions", () => {
  it("is a radiogroup with one radio per option", () => {
    const wrapper = mountOptions();

    expect(wrapper.attributes("role")).toBe("radiogroup");
    expect(wrapper.attributes("aria-label")).toBe("Noise filter");
    expect(wrapper.findAll('[role="radio"]').map((o) => o.text())).toEqual(["off", "low", "high"]);
  });

  it("checks only the selected option", () => {
    const checked = mountOptions()
      .findAll('[role="radio"]')
      .map((o) => o.attributes("aria-checked"));

    expect(checked).toEqual(["false", "true", "false"]);
  });

  it("selects on click", async () => {
    const wrapper = mountOptions();

    await wrapper.findAll('[role="radio"]')[2].trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([[2]]);
  });

  it("does not re-emit when the already selected option is clicked", async () => {
    const wrapper = mountOptions();

    await wrapper.findAll('[role="radio"]')[1].trigger("click");

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  // Roving tabindex: the group is a single tab stop, arrows move within it.
  it("keeps a single tab stop on the selected option", () => {
    const tabindexes = mountOptions()
      .findAll('[role="radio"]')
      .map((o) => o.attributes("tabindex"));

    expect(tabindexes).toEqual(["-1", "0", "-1"]);
  });

  it("falls back to the first option as the tab stop when nothing matches", () => {
    const tabindexes = mountOptions("unknown")
      .findAll('[role="radio"]')
      .map((o) => o.attributes("tabindex"));

    expect(tabindexes).toEqual(["0", "-1", "-1"]);
  });

  it.each([
    ["ArrowRight", 2],
    ["ArrowDown", 2],
    ["ArrowLeft", 0],
    ["ArrowUp", 0],
    ["Home", 0],
    ["End", 2],
  ])("moves the selection with %s", async (key, expected) => {
    const wrapper = mountOptions();

    await wrapper.findAll('[role="radio"]')[1].trigger("keydown", { key });

    expect(wrapper.emitted("update:modelValue")).toEqual([[expected]]);
  });

  it.each([
    ["ArrowRight", 2, 0],
    ["ArrowDown", 2, 0],
    ["ArrowLeft", 0, 2],
    ["ArrowUp", 0, 2],
  ])("wraps around with %s", async (key, from, expected) => {
    const wrapper = mountOptions(from);

    await wrapper.findAll('[role="radio"]')[from].trigger("keydown", { key });

    expect(wrapper.emitted("update:modelValue")).toEqual([[expected]]);
  });

  it("ignores keys that are not group navigation", async () => {
    const wrapper = mountOptions();

    await wrapper.findAll('[role="radio"]')[1].trigger("keydown", { key: "a" });

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("moves focus along with the selection", async () => {
    const wrapper = mountOptions();
    const radios = wrapper.findAll('[role="radio"]');

    await radios[1].trigger("keydown", { key: "ArrowRight" });
    await wrapper.setProps({ modelValue: 2 });

    expect(document.activeElement).toBe(radios[2].element);
    wrapper.unmount();
  });
});
