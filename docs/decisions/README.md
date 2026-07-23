# Architecture Decision Records

Technical decisions in this project are captured as Architecture Decision Records
(ADRs) — short, immutable documents in [Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

**Product decisions** (app name, MVP scope, visual direction) do NOT live here —
they go into the decision log in [`../PROJECT.md`](../PROJECT.md) §10 (Polish).
ADRs cover **technical** decisions: library choices, seams, formats, protocols.

## When to write an ADR

Write one whenever a decision:
- constrains future work (a seam, a wire format, a dependency), or
- resolves a trade-off that someone will later ask "why did they do it this way?"

Routine implementation choices that follow the spec need no ADR.

## Rules

- **Naming:** `NNNN-short-slug.md`, numbered sequentially (`0001`, `0002`, …).
- **Immutable:** never rewrite an accepted ADR. To change course, write a new ADR
  and mark the old one `Superseded by [NNNN](NNNN-slug.md)`.
- **Statuses:** `Proposed` → `Accepted` | `Rejected`; later possibly `Superseded`.
- Keep it short — a screenful. Context and consequences matter more than prose.

## Template

    # NNNN. Title (imperative, e.g. "Use tauri-specta for type generation")

    ## Status
    Accepted (YYYY-MM-DD)

    ## Context
    What forces are at play? What problem does this solve?

    ## Decision
    What we decided, stated actively: "We will …"

    ## Consequences
    What becomes easier, what becomes harder, what follow-up work this creates.

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
