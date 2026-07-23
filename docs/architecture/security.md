# Security surface

What the app is allowed to do, and where that is enforced. The rule from
PROJECT.md §4: the capability set is as narrow as the features require, and it
is widened only in the PR that needs the widening.

**Status:** the ACL and CSP below are in place since the scaffold (#1). Rows
marked *(planned)* land with their issue.

## Tauri ACL

`src-tauri/capabilities/default.json` is the single capability file. It applies
to the `main` window and grants:

| Permission | Why |
|---|---|
| `core:default` | Window chrome, webview, event plumbing — the Tauri baseline |
| `log:default` | Diagnostics via `tauri-plugin-log` |
| `store:default` | Local settings/profile persistence via `tauri-plugin-store` |
| `notification:default` | Low-battery notifications |

Deliberately **absent**:

- **`shell:*`** — the webview cannot spawn a process. `headsetcontrol` is
  executed from Rust in `src-tauri/src/backend/headsetcontrol.rs`; see
  [ADR 0002](../decisions/0002-exec-headsetcontrol-from-rust.md).
- **`http:*`** — the app makes no network requests. The M3 updater
  ([#22](https://github.com/AdrianKuriata/HeadsetControl-GUI/issues/22)) uses
  `tauri-plugin-updater`, which has its own endpoint allowlist in
  `tauri.conf.json` — not a general HTTP permission *(planned)*.
- **`fs:*`** — file access goes through the store plugin's own scope, not raw
  filesystem permissions.

Reviewing the ACL means reading one file. If a PR adds a permission there, it
needs a line in its description saying which feature requires it.

## Content Security Policy

`app.security.csp` in `src-tauri/tauri.conf.json` restricts the webview to
same-origin assets plus Tauri's IPC and asset endpoints. No remote origin is
allowed, which is why fonts (Inter Tight, IBM Plex Mono) are bundled with the
app rather than loaded from a CDN — see
[design-system.md](design-system.md).

`app.security.devCsp` additionally allows the Vite dev server and its HMR
websocket (`localhost:1420` / `1421`). It applies to `make dev` only; production
bundles use `csp`.

## Hardware safety

Independent of the ACL and non-negotiable: the app never issues firmware updates
or unverified write commands. Only runtime settings that `headsetcontrol`
exposes as capabilities are written — see [capabilities.md](capabilities.md).
