# Headset Deck

> **Provisional name** — the final application name is decided in
> [#24](https://github.com/AdrianKuriata/HeadsetControl-GUI/issues/24).

A desktop GUI for [headsetcontrol](https://github.com/Sapd/HeadsetControl) on Linux:
battery, sidetone, chatmix, equalizer, lights and inactivity timeout for USB and
wireless headsets — rendered from the capabilities your headset actually reports,
not from a hardcoded device list.

**Status: early development (M0).** Nothing is released yet.

## Stack

Tauri 2 · Vue 3.5 (`<script setup>`, TypeScript strict) · Pinia 4 · Vite 8 ·
Rust stable (edition 2024).

## Requirements

- Rust ≥ 1.90 (edition 2024; Tauri 2.12 needs it) — install via [rustup](https://rustup.rs)
- Node.js 20+ and npm
- Tauri Linux prerequisites:
  ```sh
  sudo apt install pkg-config libssl-dev libwebkit2gtk-4.1-dev libxdo-dev \
      libayatana-appindicator3-dev librsvg2-dev libudev-dev
  ```
  `libudev-dev` is the Linux hotplug monitor's build dependency; it is not
  needed on other platforms, where the app watches devices by polling.
- The `headsetcontrol` binary in `PATH`, **4.1.1 or newer** (runtime dependency).
  4.0.0 and 4.1.0 send a packet on every status read that permanently shifts an
  Audeze Maxwell's audio balance (Sapd/HeadsetControl#561), so the app refuses
  them. Until 4.1.1 is released, build upstream master: `4.1.0-8-g…` and later
  carry the fix, and `make dev-upstream` does it for you. Upstream publishes
  releases in a PPA (`ppa:sapd/headsetcontrol`), a Fedora COPR
  (`thesapd/headsetcontrol`), the AUR, and as signed packages on
  [releases/latest](https://github.com/Sapd/HeadsetControl/releases/latest).
- For `make smoke` only: `cargo install tauri-driver` and
  `sudo apt install webkit2gtk-driver` (plus `xvfb` on a headless machine)

## Development

The `Makefile` is the single command interface — see `make help`.

```sh
make setup   # install npm + cargo dependencies
make dev     # run the app in development mode
make build   # production build (bundles .deb + AppImage)
make ci      # full local gate before pushing
```

Some gates (`make lint`, `make coverage`, `make fe-e2e`) stay red until the
toolchain and test issues (#2, #3, #4) land.

## Documentation

- [`docs/PROJECT.md`](docs/PROJECT.md) — the spec (Polish)
- [`docs/architecture/`](docs/architecture/README.md) — living technical docs
- [`docs/decisions/`](docs/decisions/README.md) — architecture decision records
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contributor entry point

## License

[GPL-3.0-or-later](LICENSE).
