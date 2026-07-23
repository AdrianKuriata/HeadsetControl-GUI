# 0001. Record architecture decisions

## Status

Accepted (2026-07-23)

## Context

This project is developed autonomously by an AI agent, with the repository owner
reviewing PRs. Technical decisions were previously scattered across
`docs/PROJECT.md` §10 (a Polish decision-log table mixing product and technical
entries), PR descriptions, and commit messages. Contributors and the agent itself
need a durable, searchable record of *why* technical choices were made, in English.

## Decision

We will record technical decisions as Architecture Decision Records in
`docs/decisions/`, using the Nygard format (Status / Context / Decision /
Consequences), numbered `NNNN-slug.md`, immutable once accepted.

Product decisions (naming, scope, visual direction) stay in `docs/PROJECT.md` §10
(Polish) — that table remains the owner's product log.

## Consequences

- Every architectural decision made during implementation gains a permanent,
  linkable rationale; "why" questions get answered by `git log`-proof documents.
- Writing an ADR becomes part of the Definition of Done (CLAUDE.md) whenever an
  architectural decision is made mid-task — a small per-task cost.
- The split (product → §10 PL, technical → ADR EN) must be kept in mind when
  logging decisions; the rule lives in `docs/decisions/README.md` and CLAUDE.md.
