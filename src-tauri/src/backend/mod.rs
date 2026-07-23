//! Headset access behind a single seam.
//!
//! `trait HeadsetBackend` (added in #4) is the dependency-inversion boundary:
//! [`headsetcontrol`] is the adapter over the external CLI, and a future native
//! HID backend plugs in behind the same trait without frontend changes.

mod headsetcontrol;
mod hotplug;
