import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import HToast from "./HToast.vue";

const DISMISS = "Dismiss";

describe("HToast", () => {
  it("shows the message it is handed", () => {
    const wrapper = mount(HToast, {
      props: { dismissLabel: DISMISS },
      slots: { default: "Sidetone could not be set" },
    });

    expect(wrapper.get('[data-part="message"]').text()).toBe("Sidetone could not be set");
  });

  it("announces itself without stealing focus", () => {
    const wrapper = mount(HToast, { props: { dismissLabel: DISMISS } });

    expect(wrapper.get('[data-part="toast"]').attributes("role")).toBe("status");
  });

  it("emits dismiss when acknowledged", async () => {
    const wrapper = mount(HToast, { props: { dismissLabel: DISMISS } });

    await wrapper.get('[data-part="dismiss"]').trigger("click");

    expect(wrapper.emitted("dismiss")).toHaveLength(1);
  });

  it("takes the button's label from the caller", () => {
    const wrapper = mount(HToast, { props: { dismissLabel: "Zamknij" } });

    expect(wrapper.get('[data-part="dismiss"]').text()).toBe("Zamknij");
  });
});
