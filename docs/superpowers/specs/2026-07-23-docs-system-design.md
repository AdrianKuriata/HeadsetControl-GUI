# Documentation system for HeadsetControl-GUI — design

**Date:** 2026-07-23
**Status:** Approved by owner (brainstorming session)
**Issue:** #29

## Goal

Establish a living technical and business-logic documentation system in `docs/`,
maintained per-PR, serving three audiences: contributors, the AI agent developing the
project, and end users of the application.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Audience | All three: contributors, AI agent, end users |
| Maintenance model | Living docs — updating docs is part of every issue's Definition of Done |
| Language | Everything in English; `PROJECT.md` stays Polish as the owner's spec (exception) |
| Framework | Diátaxis-lite + ADRs (approach A; arc42 single-doc and minimal-README rejected) |

## Target structure

```
docs/
├── PROJECT.md              # PL, owner's spec — unchanged (product decisions in §10)
├── architecture/           # EN, explanation — for contributors and the AI agent
│   ├── README.md           # documentation map + meta-rules for maintaining docs
│   └── overview.md         # system map: layers, seams, data flow (initially the only file)
├── decisions/              # EN, Architecture Decision Records
│   ├── README.md           # what an ADR is, index, template
│   └── 0001-record-architecture-decisions.md
├── user/                   # EN, how-to for end users
│   └── (empty until M3 — first real file: installation.md at first release)
└── fixtures/               # unchanged
```

**Growth rule:** a documentation file is created together with the area it describes —
`state-machine.md` with issue #5, `design-system.md` with #6, `capabilities.md` with
#12, `user/installation.md` with packaging (M3). No documentation written ahead of the
code it documents.

**`architecture/design-system.md`** (lands with issue #6) documents the UI layer:
design tokens and their source (the HTML mock stays the visual authority — the doc
explains mechanics, never duplicates values), the H-component catalog and when to use
each, the platform-accent mechanism (`DeviceProfile.variants` → `[data-platform]` →
CSS variables), and the hard rules (no gradients, no emoji, Inter Tight + IBM Plex
Mono only).

## Conventions

- **ADR:** Nygard format — `NNNN-slug.md` with *Status / Context / Decision /
  Consequences*. ADRs are immutable: changing a decision means a new ADR linking the
  old one with "Supersedes".
- **Decision split:** product decisions (app name, MVP scope) → `PROJECT.md` §10 (PL);
  technical decisions (library choice, seam, format) → ADR (EN).
- **architecture/ files:** short (≤ ~150 lines), diagrams as Mermaid in Markdown
  (renders on GitHub), links to code via relative paths.

## Workflow integration (CLAUDE.md changes)

- Definition of Done gains: *"docs/architecture updated if the change touches an area
  it describes; ADR written for any architectural decision."*
- "After the task" section: replace "Add a row to PROJECT.md §10" with the
  product/technical decision split above.
- Step 6 of the autonomous loop points to `docs/architecture/README.md` as the
  meta-guide.

## Scope

**Now (issue #29, before issue #1):** directory skeleton, `architecture/README.md`
(meta-rules), `overview.md` (condensed EN translation of PROJECT.md §3),
`decisions/0001`, CLAUDE.md updates.

**Later:** organic growth per issue, enforced through the Definition of Done.

## Error handling / edge cases

- Docs drifting from code: prevented by the DoD gate; PR review is the enforcement
  point.
- Conflict between PROJECT.md (PL spec) and architecture/ (EN docs): PROJECT.md wins
  for product intent, ADRs win for technical decisions made after the spec; the
  conflict itself should be resolved by a new ADR or a §10 row.

## Testing

Not applicable (documentation-only change). Verification: files exist, Mermaid renders
on GitHub, CLAUDE.md references resolve.
