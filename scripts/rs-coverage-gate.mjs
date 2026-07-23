#!/usr/bin/env node
// Rust coverage gate (PROJECT.md §4): 100% for the parser, adapter and state
// machine. Bootstrap (`main.rs`, `lib.rs`) is excluded from the measurement.
//
// `cargo llvm-cov --fail-under-lines` cannot be used directly: while the backend
// modules are still empty there are zero coverable lines, and llvm-cov reports
// that as 0% rather than "nothing to measure", which would keep CI red for no
// reason. This script fails on a real regression and stays quiet on an empty
// measurement set.
//
// Branch coverage is not part of the gate: LLVM branch data needs a nightly
// toolchain, so `regions` — the closest stable equivalent — is checked instead.
import { spawnSync } from "node:child_process";

const THRESHOLD = 100;
const METRICS = ["lines", "functions", "regions"];
const MANIFEST = "src-tauri/Cargo.toml";
const BOOTSTRAP = "src/(main|lib)\\.rs$";

const cargo = spawnSync(
  "cargo",
  [
    "--locked",
    "llvm-cov",
    "--manifest-path",
    MANIFEST,
    "--ignore-filename-regex",
    BOOTSTRAP,
    "--json",
    "--summary-only",
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

if (cargo.status !== 0) {
  console.error("cargo llvm-cov failed");
  process.exit(cargo.status ?? 1);
}

const totals = JSON.parse(cargo.stdout).data[0].totals;
const failures = [];

for (const metric of METRICS) {
  const { count, covered, percent } = totals[metric];
  if (count === 0) {
    console.log(`${metric}: nothing to measure yet`);
    continue;
  }
  const rounded = percent.toFixed(2);
  console.log(`${metric}: ${rounded}% (${covered}/${count})`);
  if (percent < THRESHOLD) {
    failures.push(`${metric} ${rounded}% < ${THRESHOLD}%`);
  }
}

if (failures.length > 0) {
  console.error(`\nRust coverage below threshold: ${failures.join(", ")}`);
  console.error("Run `cargo llvm-cov --manifest-path src-tauri/Cargo.toml --html` for details.");
  process.exit(1);
}
