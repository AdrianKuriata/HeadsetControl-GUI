//! Device watcher: udev monitor emitting `devices-changed`, polling as fallback.
//!
//! One of the few modules allowed to contain OS-specific code (behind
//! `DeviceWatcher`). Populated in #10.
