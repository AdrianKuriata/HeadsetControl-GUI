# Security surface

What the app is allowed to do, and where that is enforced. The rule from
PROJECT.md §4: the capability set is as narrow as the features require, and it
is widened only in the PR that needs the widening.

**Status:** the ACL and CSP below are in place since the scaffold (#1); the
process boundary and supply-chain sections landed with the hardening pass
([ADR 0012](../decisions/0012-hardening-the-cli-boundary-and-the-supply-chain.md)).
Rows marked *(planned)* land with their issue.

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
  executed from Rust in `src-tauri/src/backend/exec.rs`; see
  [ADR 0002](../decisions/0002-exec-headsetcontrol-from-rust.md).
- **`http:*`** — the app makes no network requests. The M3 updater
  ([#22](https://github.com/AdrianKuriata/HeadsetControl-GUI/issues/22)) uses
  `tauri-plugin-updater`, which has its own endpoint allowlist in
  `tauri.conf.json` — not a general HTTP permission *(planned)*.
- **`fs:*`** — file access goes through the store plugin's own scope, not raw
  filesystem permissions.

Reviewing the ACL means reading one file. If a PR adds a permission there, it
needs a line in its description saying which feature requires it.

## Content Security Policy and headers

`app.security` in `src-tauri/tauri.conf.json` holds three things:

- **`csp`** restricts the webview to same-origin assets plus Tauri's IPC and
  asset endpoints. No remote origin is allowed, which is why fonts (Inter Tight,
  IBM Plex Mono) are bundled with the app rather than loaded from a CDN — see
  [design-system.md](design-system.md). Beyond `default-src 'self'` it pins the
  directives that do not fall back to it: `base-uri`, `object-src`, `frame-src`,
  `frame-ancestors`, `form-action`, `worker-src`. `style-src` keeps
  `'unsafe-inline'` — Vue writes inline styles for `:style` bindings, and the
  alternative is a nonce the webview cannot supply.
- **`devCsp`** additionally allows the Vite dev server and its HMR websocket
  (`localhost:1420` / `1421`). It applies to `make dev` only; production bundles
  use `csp`.
- **`freezePrototype: true`** and a small set of response `headers`
  (`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
  `X-Content-Type-Options`, and a `Permissions-Policy` that turns off camera,
  microphone, geolocation, USB, HID, serial and payment). The app reaches
  hardware through Rust, so no web API for it needs to stay enabled.

## The process boundary

`headsetcontrol` is the one external thing the app runs, and
`src-tauri/src/backend/exec.rs` is the only place that runs it. Four rules hold
there — the reasoning is in
[ADR 0012](../decisions/0012-hardening-the-cli-boundary-and-the-supply-chain.md):

| Rule | Why |
|---|---|
| Resolved on `PATH`, **absolute entries only** | `Command::new(name)` lets the OS search; on Windows that starts in the working directory, and a relative entry means the same anywhere |
| Killed after `CALL_TIMEOUT` (10 s) | A wedged binary would otherwise block its caller forever |
| At most `MAX_OUTPUT_BYTES` (1 MiB) kept per stream | Broken or hostile output must not fill memory; reading continues past the cap so the child never blocks on a full pipe |
| One invocation at a time (`Mutex`) | The hotplug loop, the refresh loop and user writes all reach the same hidraw node |

Arguments are always passed as a vector, never through a shell, and the device
id is validated by parsing it as hex and **re-formatting** it
(`headsetcontrol.rs::cli_device_arg`) — nothing the frontend sends reaches the
command line verbatim.

IPC commands are `#[tauri::command(async)]` so this blocking work never runs on
the main thread. `src-tauri/src/commands.rs` says why.

## Hardware safety

Independent of the ACL and non-negotiable: the app never issues firmware updates
or unverified write commands. Only runtime settings that `headsetcontrol`
exposes as capabilities are written — see [capabilities.md](capabilities.md).

Rust is the last gate before the device, so it does not trust the UI to have
clamped anything. `WRITE_FLAGS` in `backend/headsetcontrol.rs` carries an
inclusive range per capability, copied from upstream's own
`lib/capability_descriptors.hpp`; a value outside it is refused before a process
is spawned. That range is a **sanity bound**, not a device's true maximum —
per-device limits are profile knowledge (`src/profiles/`).

## Supply chain

- **Dependencies** are bumped weekly by Dependabot (`.github/dependabot.yml`)
  across npm, cargo and GitHub Actions.
- **Advisories** are checked by the `Dependency audit` CI job, which runs
  `make audit`. What ships is the gate: `npm audit --omit=dev --audit-level=high`
  plus `cargo audit`. A devDependency advisory is printed and left to Dependabot
  rather than blocking an unrelated PR.
- **Actions are pinned to commit SHAs**, never to a tag or branch — both are
  mutable, and moving one is enough to run code in a job that holds the checkout
  and the caches. The version each SHA was at is the comment beside it.
- **`unsafe_code = "forbid"`** for the whole crate (`src-tauri/Cargo.toml`).
- **Test seams do not ship.** `MockBackend` and its fixture device are compiled
  in only when `VITE_BACKEND=mock`; a production bundle drops them, along with
  the `window.__headsetDeckMock` handle that scripts them
  (`src/core/create-backend.ts`).
