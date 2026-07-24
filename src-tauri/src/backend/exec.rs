//! The one place in the app that spawns a process.
//!
//! Kept apart from the adapter on purpose: everything in
//! [`super::headsetcontrol`] is pure and gated at 100% coverage against recorded
//! fixtures, which is only possible because the exec lives behind
//! [`CliRunner`]. This file has no logic to unit-test — it would be testing
//! `std::process` — so the coverage gate excludes it and the smoke E2E suite
//! (#14) covers the real invocation.
//!
//! The webview cannot reach any of this: there is no `shell:*` permission in the
//! Tauri ACL, so spawning `headsetcontrol` is Rust's job alone (ADR 0002).

use std::process::Command;

use super::headsetcontrol::{CliOutput, CliRunner};

/// Looked up on `PATH`. Locating a binary that is not there — and telling the
/// user about it — is binary detection (#9); until then a missing binary simply
/// surfaces as a failed call.
pub const BINARY: &str = "headsetcontrol";

/// Runs the real `headsetcontrol`.
pub struct ProcessRunner;

impl CliRunner for ProcessRunner {
    fn run(&self, args: &[String]) -> Result<CliOutput, String> {
        let output = Command::new(BINARY)
            .args(args)
            .output()
            .map_err(|error| error.to_string())?;

        // Not `from_utf8`: a device name can carry whatever bytes its firmware
        // holds, and a stray byte must not turn a good reading into an error.
        Ok(CliOutput {
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        })
    }
}
