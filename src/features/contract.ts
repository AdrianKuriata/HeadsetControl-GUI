import type { DeviceState, ParamValue } from "../core/types.gen";

/**
 * What every feature row is handed, and what it hands back.
 *
 * The props are the same for all of them on purpose: `App.vue` renders whatever
 * the registry maps a capability to, without knowing which capability it is
 * (OCP — PROJECT.md §3.4). A row uses the half it needs and ignores the rest.
 */
export interface FeatureProps {
  /**
   * The last value written for this capability, or `undefined` when the app has
   * not written one. Most capabilities cannot be read back from the CLI
   * (ADR 0009), so "not written yet" is the normal starting point and a row
   * must show it as unknown rather than claim the device is off.
   */
  value?: ParamValue;
  /** What the device does report back — battery and chatmix only. */
  readings?: DeviceState | null;
}

/** The one event a row emits: the user asked for this value. */
export type FeatureEmits = { change: [value: ParamValue] };

/** The number behind a value, or `undefined` if there is none to show. */
export function asInt(value: ParamValue | undefined): number | undefined {
  return value?.kind === "int" ? value.value : undefined;
}

/** The flag behind a value, or `undefined` if there is none to show. */
export function asBool(value: ParamValue | undefined): boolean | undefined {
  return value?.kind === "bool" ? value.value : undefined;
}

export function int(value: number): ParamValue {
  return { kind: "int", value };
}

export function bool(value: boolean): ParamValue {
  return { kind: "bool", value };
}
