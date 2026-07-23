//! Adapter over the external `headsetcontrol` binary.
//!
//! Anti-corruption layer: raw `--output json` is validated and mapped onto
//! internal domain types; the UI never sees the CLI's JSON shape.
//!
//! Populated in #8 (parser) and #9 (binary detection).
