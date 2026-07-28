import { describe, expect, it } from "vitest";

import type { ParamValue } from "../core/types.gen";
import { at, mountWithI18n } from "../test-support";
import ChatmixRow from "./ChatmixRow.vue";
import EqualizerSection from "./EqualizerSection.vue";
import InactiveTimeRow from "./InactiveTimeRow.vue";
import LightsRow from "./LightsRow.vue";
import NoiseFilterRow from "./NoiseFilterRow.vue";
import SidetoneRow from "./SidetoneRow.vue";
import VoicePromptsRow from "./VoicePromptsRow.vue";

const int = (value: number): ParamValue => ({ kind: "int", value });
const bool = (value: boolean): ParamValue => ({ kind: "bool", value });

/** What the row reports in its value column. */
function readout(wrapper: { text: () => string }): string {
  return wrapper.text();
}

describe("every feature row", () => {
  // The shared contract: nothing written yet must never render as "off" — the
  // CLI cannot read these back, so the app does not know (ADR 0009).
  it.each([
    { name: "sidetone", component: SidetoneRow },
    { name: "noise filter", component: NoiseFilterRow },
    { name: "voice prompts", component: VoicePromptsRow },
    { name: "lights", component: LightsRow },
    { name: "auto power-off", component: InactiveTimeRow },
    { name: "equalizer", component: EqualizerSection },
  ])("shows $name as unknown until a value is written", ({ component }) => {
    const { wrapper } = mountWithI18n(component);

    expect(wrapper.get('[data-part="row"]').text()).toContain("—");
  });
});

describe("SidetoneRow", () => {
  it("writes the level the slider is moved to", async () => {
    const { wrapper } = mountWithI18n(SidetoneRow, { props: { value: int(20) } });

    await wrapper.get("input").setValue(64);

    expect(wrapper.emitted("change")).toEqual([[int(64)]]);
  });

  it("spans the range the CLI accepts", () => {
    const slider = mountWithI18n(SidetoneRow).wrapper.get("input");

    expect(slider.attributes("min")).toBe("0");
    expect(slider.attributes("max")).toBe("128");
  });

  it("reads out the level against the maximum", () => {
    const { wrapper } = mountWithI18n(SidetoneRow, { props: { value: int(64) } });

    expect(readout(wrapper)).toContain("64");
    expect(readout(wrapper)).toContain("/ 128");
  });

  it("calls zero off rather than a number", () => {
    const { wrapper } = mountWithI18n(SidetoneRow, { props: { value: int(0) } });

    expect(wrapper.get('[data-part="level"]').text()).toBe("off");
  });
});

describe("ChatmixRow", () => {
  it("shows the balance the headset reports", () => {
    const { wrapper } = mountWithI18n(ChatmixRow, {
      props: { readings: { battery: null, chatmix: 32 } },
    });

    // Halfway toward game: chat fades to half, game stays full.
    expect(wrapper.get('[data-part="balance"]').text()).toBe("100 / 50");
  });

  it("shows an even balance in the middle of the range", () => {
    const { wrapper } = mountWithI18n(ChatmixRow, {
      props: { readings: { battery: null, chatmix: 64 } },
    });

    expect(wrapper.get('[data-part="balance"]').text()).toBe("100 / 100");
  });

  it("fades the chat side toward the top of the range", () => {
    const { wrapper } = mountWithI18n(ChatmixRow, {
      props: { readings: { battery: null, chatmix: 96 } },
    });

    expect(wrapper.get('[data-part="balance"]').text()).toBe("50 / 100");
  });

  it("shows nothing to read as unknown", () => {
    const { wrapper } = mountWithI18n(ChatmixRow, {
      props: { readings: { battery: null, chatmix: null } },
    });

    expect(wrapper.get('[data-part="balance"]').text()).toBe("—");
  });

  it("marks where the balance sits", () => {
    const { wrapper } = mountWithI18n(ChatmixRow, {
      props: { readings: { battery: null, chatmix: 32 } },
    });

    expect(wrapper.get('[data-part="marker"]').attributes("style")).toContain("left: 25%");
  });

  it("marks nothing while there is no reading", () => {
    const { wrapper } = mountWithI18n(ChatmixRow, {
      props: { readings: { battery: null, chatmix: null } },
    });

    expect(wrapper.find('[data-part="marker"]').exists()).toBe(false);
  });

  it("offers no control, because the dial is on the headset", () => {
    const { wrapper } = mountWithI18n(ChatmixRow, {
      props: { readings: { battery: null, chatmix: 64 } },
    });

    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.find("button").exists()).toBe(false);
  });
});

describe("NoiseFilterRow", () => {
  it("offers the three levels the CLI accepts", () => {
    const { wrapper } = mountWithI18n(NoiseFilterRow);

    expect(wrapper.findAll('[role="radio"]').map((option) => option.text())).toEqual([
      "off",
      "low",
      "high",
    ]);
  });

  it("writes the level that was picked", async () => {
    const { wrapper } = mountWithI18n(NoiseFilterRow, { props: { value: int(0) } });

    await at(wrapper.findAll('[role="radio"]'), 2).trigger("click");

    expect(wrapper.emitted("change")).toEqual([[int(2)]]);
  });

  it("marks the level in use", () => {
    const { wrapper } = mountWithI18n(NoiseFilterRow, { props: { value: int(1) } });

    expect(at(wrapper.findAll('[role="radio"]'), 1).attributes("aria-checked")).toBe("true");
    expect(wrapper.get('[data-part="level"]').text()).toBe("low");
  });

  it("marks nothing while the level is unknown", () => {
    const { wrapper } = mountWithI18n(NoiseFilterRow);

    expect(wrapper.findAll('[aria-checked="true"]')).toHaveLength(0);
  });
});

describe("VoicePromptsRow", () => {
  it("writes a flag rather than a number", async () => {
    const { wrapper } = mountWithI18n(VoicePromptsRow, { props: { value: bool(false) } });

    await at(wrapper.findAll('[role="radio"]'), 0).trigger("click");

    expect(wrapper.emitted("change")).toEqual([[bool(true)]]);
  });

  it("reads out that prompts are active", () => {
    const { wrapper } = mountWithI18n(VoicePromptsRow, { props: { value: bool(true) } });

    expect(wrapper.get('[data-part="state"]').text()).toBe("active");
  });
});

describe("LightsRow", () => {
  it("turns the lights off", async () => {
    const { wrapper } = mountWithI18n(LightsRow, { props: { value: bool(true) } });

    await at(wrapper.findAll('[role="radio"]'), 1).trigger("click");

    expect(wrapper.emitted("change")).toEqual([[bool(false)]]);
  });

  it("reads out the state it was left in", () => {
    const { wrapper } = mountWithI18n(LightsRow, { props: { value: bool(false) } });

    expect(wrapper.get('[data-part="state"]').text()).toBe("off");
  });
});

describe("InactiveTimeRow", () => {
  it("steps up the ladder rather than one minute at a time", async () => {
    const { wrapper } = mountWithI18n(InactiveTimeRow, { props: { value: int(15) } });

    await at(wrapper.findAll("button"), 1).trigger("click");

    expect(wrapper.emitted("change")).toEqual([[int(30)]]);
  });

  it("steps back down", async () => {
    const { wrapper } = mountWithI18n(InactiveTimeRow, { props: { value: int(15) } });

    await at(wrapper.findAll("button"), 0).trigger("click");

    expect(wrapper.emitted("change")).toEqual([[int(10)]]);
  });

  it("stops at never", async () => {
    const { wrapper } = mountWithI18n(InactiveTimeRow, { props: { value: int(0) } });

    await at(wrapper.findAll("button"), 0).trigger("click");

    expect(wrapper.emitted("change")).toBeUndefined();
  });

  it("stops at the longest the CLI accepts", async () => {
    const { wrapper } = mountWithI18n(InactiveTimeRow, { props: { value: int(90) } });

    await at(wrapper.findAll("button"), 1).trigger("click");

    expect(wrapper.emitted("change")).toBeUndefined();
  });

  it("calls zero never, not a duration", () => {
    const { wrapper } = mountWithI18n(InactiveTimeRow, { props: { value: int(0) } });

    expect(wrapper.get('[data-part="after"]').text()).toBe("never");
  });

  it("names the duration in minutes", () => {
    const { wrapper } = mountWithI18n(InactiveTimeRow, { props: { value: int(45) } });

    expect(wrapper.get('[data-part="after"]').text()).toBe("45 min");
  });

  it("treats a value past the top of the ladder as the longest", async () => {
    // Another tool could have set something the CLI's own range does not reach.
    const { wrapper } = mountWithI18n(InactiveTimeRow, { props: { value: int(120) } });

    expect(wrapper.get('[data-part="after"]').text()).toBe("120 min");

    await at(wrapper.findAll("button"), 1).trigger("click");
    expect(wrapper.emitted("change")).toBeUndefined();
  });

  it("steps on from a value that is not on the ladder", async () => {
    // A headset left at 20 minutes by another tool: the next rung up is 30.
    const { wrapper } = mountWithI18n(InactiveTimeRow, { props: { value: int(20) } });

    await at(wrapper.findAll("button"), 1).trigger("click");

    expect(wrapper.emitted("change")).toEqual([[int(45)]]);
  });
});

describe("EqualizerSection", () => {
  it("offers the presets the CLI accepts", () => {
    const { wrapper } = mountWithI18n(EqualizerSection);

    expect(wrapper.findAll('[role="radio"]')).toHaveLength(10);
  });

  it("writes the preset that was picked, counting from zero", async () => {
    const { wrapper } = mountWithI18n(EqualizerSection, { props: { value: int(0) } });

    await at(wrapper.findAll('[role="radio"]'), 3).trigger("click");

    expect(wrapper.emitted("change")).toEqual([[int(3)]]);
  });

  it("names the preset in use for a person, counting from one", () => {
    const { wrapper } = mountWithI18n(EqualizerSection, { props: { value: int(2) } });

    expect(wrapper.get('[data-part="preset"]').text()).toBe("Preset 3");
  });
});
