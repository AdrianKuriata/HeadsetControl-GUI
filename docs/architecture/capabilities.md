# Capabilities — the business logic

> **Status:** specified (PROJECT.md §3). Implementation lands with issues #8
> (adapter), #11 (stores), #12 (feature registry), #15 (variants), #17 (Maxwell 2
> profile) — reconcile this doc in those PRs.

The whole product rests on one idea: **the UI is rendered from what the device
says it can do** (`headsetcontrol --output json` → `capabilities` array), never
from a hardcoded device model. Example device report:
[`../fixtures/maxwell2-xbox-output-json.json`](../fixtures/maxwell2-xbox-output-json.json)
— a Maxwell 2 Xbox dongle reporting `CAP_SIDETONE`, `CAP_BATTERY_STATUS`,
`CAP_INACTIVE_TIME`, `CAP_CHATMIX_STATUS`, `CAP_VOICE_PROMPTS`,
`CAP_EQUALIZER_PRESET`, `CAP_NOISE_FILTER`.

## The two-registry model

```mermaid
flowchart TD
    JSON[headsetcontrol JSON] -->|validated by adapter| DEV[Device: vid, pid,\ncapabilities, values]
    DEV --> FREG["features/registry.ts\ncapability → component"]
    DEV --> PREG["profiles/registry.ts\n(vid,pid) → DeviceProfile"]
    PREG -->|fallback| GEN[GenericProfile]
    FREG --> ROWS[Feature rows rendered\nin capability order]
    PREG --> ROWS
    PREG -->|variants map| THEME[data-platform theme]
```

**`features/registry.ts`** — one capability = one Vue component
(`CAP_SIDETONE` → `SidetoneRow.vue`, `CAP_EQUALIZER_PRESET` →
`EqualizerSection.vue`, …). Adding support for a new headsetcontrol feature =
one new file in `features/` + one registry entry. **Zero edits to existing
files** (OCP — this is the extension seam of the whole app).

**`profiles/registry.ts`** — `(vid, pid)` → `DeviceProfile`. Profiles carry the
*model-specific* knowledge Rust is forbidden to have: EQ preset names, band
frequencies, PID→platform `variants` map. Unknown device → `GenericProfile`
(everything still works, just without nice names). `DeviceProfile` is
interface-segregated: a profile declares only what it overrides.

## Division of knowledge (the hard boundary)

| Knows | Never knows |
|---|---|
| **Rust backend**: capabilities, values, how to call the binary | headset models, preset names, platforms |
| **Frontend profiles**: model quirks, preset names, platform variants | how JSON is fetched or validated |
| **Feature components**: how to render one capability | which device they serve, other capabilities |

## Rules

- **Unknown capability** (new binary, older GUI): logged, ignored, nothing
  renders for it — never a crash. Forward compatibility by default.
- **Capability absent** (feature removed, device variant lacks it): the row
  simply doesn't render. No dead controls.
- **Writes are optimistic**: store applies the value immediately, calls the
  backend, rolls back + toasts on failure (see
  [state-machine.md](state-machine.md)).
- Values shown in UI come from validated domain types (`types.gen.ts`), never
  raw JSON — the adapter is an anti-corruption layer
  (see [overview.md](overview.md)).
