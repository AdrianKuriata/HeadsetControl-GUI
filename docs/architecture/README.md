# Architecture documentation

Explanation-style docs (the [Diátaxis](https://diataxis.fr/) sense): they exist so
a contributor — human or AI agent — understands *how the system works and why*,
without reverse-engineering the code. Reference for facts, code for truth.

## Map

| File | Covers | Implementation |
|---|---|---|
| [overview.md](overview.md) | System map: layers, seams, data flow | in progress (M0–M1) |
| [state-machine.md](state-machine.md) | App state machine, one screen per state | issues #5/#9 |
| [design-system.md](design-system.md) | UI layer: tokens, H-components, platform accents | tokens + controls done (#6); accent wiring in #15 |
| [capabilities.md](capabilities.md) | Business logic: capability → UI, profiles, variants | issues #8/#11/#12/#17 |
| [testing.md](testing.md) | Test pyramid, contract fixtures, MockBackend, coverage | issues #3/#13/#14 |
| [security.md](security.md) | Tauri ACL, CSP, hardware-safety boundary | done (#1), updater in #22 |

## Rules for maintaining these docs

1. **Spec-first, then reconciled:** everything derivable from the approved spec
   (PROJECT.md) and the mock is documented up front, marked with a `Status` note
   naming the implementing issues. The PR that implements an area **must**
   reconcile its doc with reality and drop the note. New areas invented later
   get their file in the PR that builds them.
2. **Living docs:** updating the relevant file here is part of every issue's
   Definition of Done (see [CLAUDE.md](../../CLAUDE.md)). A PR that changes an
   area's behavior updates that area's doc in the same PR.
3. **Short files:** ≤ ~150 lines each. If a file outgrows that, split it by
   responsibility and update the map above.
4. **Diagrams:** Mermaid in Markdown (renders on GitHub). No binary image files.
5. **Links to code:** relative paths from repo root, e.g. `src/core/backend.ts`.
   They are pointers, not contracts — code is the source of truth.
6. **Decisions live elsewhere:** *why* something was chosen goes into an
   [ADR](../decisions/README.md); these files describe *what is and how it works*.
7. **Language:** English. The owner's product spec stays in
   [PROJECT.md](../PROJECT.md) (Polish); on conflict about product intent,
   PROJECT.md wins — file an ADR or §10 row to resolve the drift.
