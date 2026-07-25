# Security policy

## Reporting a vulnerability

Report privately through GitHub:
**[Security → Report a vulnerability](https://github.com/AdrianKuriata/HeadsetControl-GUI/security/advisories/new)**.
That opens a draft advisory only the maintainer can see. Please do not open a
public issue for a vulnerability.

Include what you have: the version or commit, the platform, what you did and
what happened. A crash needs the log; a permission or execution issue needs the
`headsetcontrol` version and how it was installed.

Expect a first reply within a week. There is one maintainer and this is a
hobby project — that is the honest number, not a service level.

## Supported versions

The project is pre-1.0 and only the latest release is supported. Fixes land on
`main` and go out in the next release; there are no backport branches.

## Scope

In scope — this repository:

- The Tauri capability set (`src-tauri/capabilities/default.json`) and the CSP
  and security headers (`src-tauri/tauri.conf.json`). Anything that widens what
  the webview can reach.
- How `headsetcontrol` is located and executed (`src-tauri/src/backend/exec.rs`)
  — binary resolution, argument construction, the output the adapter trusts.
- The IPC surface (`src-tauri/src/commands.rs`) and what it accepts from the
  frontend, including values written to a device.
- Anything that would let the app write to hardware beyond the runtime settings
  `headsetcontrol` exposes as capabilities.

Out of scope:

- **`headsetcontrol` itself** — it is a separate project. Report those to
  [Sapd/HeadsetControl](https://github.com/Sapd/HeadsetControl/security).
- Findings that require an attacker who can already write to the user's own
  `PATH` directories, home directory, or the installed binary. At that point
  the account is compromised independently of this app. (Directory entries
  outside that — a relative `PATH` entry, the current working directory — *are*
  in scope, and are refused; see `exec.rs`.)
- Advisories in development dependencies that never reach a shipped artifact.
  `make audit` reports them; only what ships gates a build.

## What the app does not do

Deliberate constraints, documented in
[`docs/architecture/security.md`](docs/architecture/security.md) and
[PROJECT.md](docs/PROJECT.md) §4 and §11:

- **No firmware updates and no unverified write commands.** Runtime settings
  only. Hardware safety outranks any feature.
- **No network access.** There is no HTTP permission in the ACL and the CSP
  allows no remote origin; fonts are bundled rather than fetched.
- **No process spawning from the webview.** There is no `shell:*` permission —
  `headsetcontrol` is executed from Rust
  ([ADR 0002](docs/decisions/0002-exec-headsetcontrol-from-rust.md)).
