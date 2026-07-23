import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import App from "./App.vue";

describe("App", () => {
  it("renders the root shell", () => {
    const wrapper = mount(App);

    expect(wrapper.find("main.app-root").exists()).toBe(true);
  });
});
