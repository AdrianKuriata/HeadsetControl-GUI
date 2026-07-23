# Documentation map

| Path | Language | What it is |
|---|---|---|
| [PROJECT.md](PROJECT.md) | Polish | The owner's spec: vision, design system, architecture, standards, **product** decision log (§10). Source of truth for product intent. |
| [architecture/](architecture/README.md) | English | Living technical docs: how the system works and why. Start at [overview.md](architecture/overview.md). |
| [decisions/](decisions/README.md) | English | Architecture Decision Records (**technical** decisions, Nygard format). |
| [user/](user/) | English | End-user guides (installation, udev permissions, FAQ). Empty until the first release (M3). |
| [fixtures/](fixtures/) | — | Recorded `headsetcontrol --output json` outputs used by contract tests. |
| [maxwell-control-mono.html](maxwell-control-mono.html) | — | Approved visual mock — the design authority for the UI. |

**Language policy:** everything in the repo is English, except `PROJECT.md` —
the owner's spec — and its §10 product decision log, which stay Polish.

**Maintenance:** docs are updated in the same PR as the code they describe —
see the rules in [architecture/README.md](architecture/README.md).
