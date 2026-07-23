# Headset Deck

> **Provisional name** — the final application name is decided in
> [#24](https://github.com/AdrianKuriata/HeadsetControl-GUI/issues/24).

A desktop GUI for [headsetcontrol](https://github.com/Sapd/HeadsetControl) on Linux:
battery, sidetone, chatmix, equalizer, lights and inactivity timeout for USB and
wireless headsets — rendered from the capabilities your headset actually reports,
not from a hardcoded device list.

**Status: early development (M0).** Nothing is released yet.

## Stack

Tauri 2 · Vue 3.5 (`<script setup>`, TypeScript strict) · Pinia 3 · Vite 7 ·
Rust stable (edition 2024).

## Requirements

- Rust ≥ 1.85 (edition 2024) — install via [rustup](https://rustup.rs)
- Node.js 20+ and npm
- Tauri Linux prerequisites:
  ```sh
  sudo apt install pkg-config libssl-dev libwebkit2gtk-4.1-dev libxdo-dev \
      libayatana-appindicator3-dev librsvg2-dev
  ```
- The `headsetcontrol` binary in `PATH` (runtime dependency)

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
