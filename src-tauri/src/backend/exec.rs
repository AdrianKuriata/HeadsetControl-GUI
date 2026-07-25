//! The app's impure edges: spawning a process, opening a device node, watching
//! the kernel for hotplug events.
//!
//! Kept apart from the modules beside it on purpose: everything in
//! [`super::headsetcontrol`], [`super::detect`] and [`super::hotplug`] is pure
//! and gated at 100% coverage against recorded fixtures, which is only possible
//! because the calls to the outside world live behind [`CliRunner`],
//! [`DeviceAccess`] and [`DeviceWatcher`]. This file has nothing to unit-test —
//! it would be testing `std::process` and libudev — so the coverage gate
//! excludes it and the smoke E2E suite (#14) covers the real invocation
//! (ADR 0009, ADR 0011).
//!
//! The webview cannot reach any of this: there is no `shell:*` permission in the
//! Tauri ACL, so spawning `headsetcontrol` is Rust's job alone (ADR 0002).

use std::process::Command;

use super::detect::{Access, DeviceAccess};
use super::headsetcontrol::{CliOutput, CliRunner};
use super::hotplug::{DeviceWatcher, POLL_INTERVAL};

/// Looked up on `PATH`. A binary that is not there cannot be spawned, and that
/// failure is exactly what [`super::detect`] reads as a missing binary — no
/// separate search of the filesystem is needed.
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

/// Answers the permission question by asking the kernel, on Linux, the same way
/// `headsetcontrol` itself does: by opening the hidraw node.
///
/// Opening is the *only* honest check. A udev rule grants access through an ACL
/// (`crw-rw----+`), which permission bits do not show — reading the mode would
/// report "denied" for a machine that works perfectly. Nothing is ever written:
/// the handle is closed the moment it is obtained (hardware safety outranks
/// convenience, PROJECT.md §11).
pub struct HidrawAccess;

/// Where Linux publishes which hidraw node belongs to which usb device.
#[cfg(target_os = "linux")]
const HIDRAW_CLASS: &str = "/sys/class/hidraw";

impl DeviceAccess for HidrawAccess {
    #[cfg(target_os = "linux")]
    fn access(&self, vendor_id: u16, product_id: u16) -> Access {
        let Ok(nodes) = std::fs::read_dir(HIDRAW_CLASS) else {
            return Access::Unknown;
        };

        let mut seen = Access::Unknown;

        for node in nodes.flatten() {
            let name = node.file_name();
            let uevent = node.path().join("device/uevent");

            if !std::fs::read_to_string(&uevent)
                .is_ok_and(|uevent| names_device(&uevent, vendor_id, product_id))
            {
                continue;
            }

            // A device can expose several interfaces and the rule may cover
            // only some of them; one that opens is enough to work with.
            match open(std::path::Path::new("/dev").join(name)) {
                Access::Granted => return Access::Granted,
                other => seen = other,
            }
        }

        seen
    }

    /// Device nodes are a Linux idea. Everywhere else the app must not claim a
    /// permission problem it has no way to see (PROJECT.md §7).
    #[cfg(not(target_os = "linux"))]
    fn access(&self, _vendor_id: u16, _product_id: u16) -> Access {
        Access::Unknown
    }
}

/// `HID_ID=0003:00003329:00004B28` — bus, vendor and product as padded hex.
#[cfg(target_os = "linux")]
fn names_device(uevent: &str, vendor_id: u16, product_id: u16) -> bool {
    uevent.lines().any(|line| {
        line.strip_prefix("HID_ID=").is_some_and(|id| {
            let mut parts = id
                .split(':')
                .skip(1)
                .filter_map(|part| u32::from_str_radix(part.trim(), 16).ok());
            parts.next() == Some(u32::from(vendor_id))
                && parts.next() == Some(u32::from(product_id))
        })
    })
}

#[cfg(target_os = "linux")]
fn open(path: std::path::PathBuf) -> Access {
    match std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
    {
        Ok(_) => Access::Granted,
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => Access::Denied,
        // Busy, gone between listing and opening, or anything else the kernel
        // reports: not a permission verdict, so it must not become one.
        Err(_) => Access::Unknown,
    }
}

/// The fallback watcher: it reports on a timer and knows nothing about the OS,
/// so it works everywhere. Whether anything actually changed is decided by
/// [`super::hotplug::watch`], which is why a bare timer is enough.
pub struct PollingWatcher;

impl DeviceWatcher for PollingWatcher {
    fn wait_for_change(&mut self) -> bool {
        std::thread::sleep(POLL_INTERVAL);
        true
    }
}

/// The native watcher for this platform, if it has one. `None` sends the app to
/// [`PollingWatcher`].
///
/// On Linux that is udev. Windows and macOS have their own device
/// notifications; until someone implements them, the fallback is the whole
/// story there (PROJECT.md §7) — hence the `None`.
#[cfg(target_os = "linux")]
pub fn native_watcher() -> Option<UdevWatcher> {
    UdevWatcher::start()
}

#[cfg(not(target_os = "linux"))]
pub fn native_watcher() -> Option<PollingWatcher> {
    None
}

/// Listens to udev for changes to the device nodes headsets appear as.
#[cfg(target_os = "linux")]
pub struct UdevWatcher {
    socket: udev::MonitorSocket,
}

/// Every headset this app can talk to is reached through a hidraw node, so this
/// one subsystem covers them all — and leaves out the rest of the machine's
/// device traffic, which would only cost needless `headsetcontrol` calls.
#[cfg(target_os = "linux")]
const HIDRAW_SUBSYSTEM: &str = "hidraw";

/// The crate's monitor socket is non-blocking and it offers no wait of its own,
/// so the socket is checked on a short timer. Cheap (one `recv` per tick) and
/// well below the latency a person notices.
#[cfg(target_os = "linux")]
const SOCKET_POLL: std::time::Duration = std::time::Duration::from_millis(200);

/// Plugging one headset in creates several nodes in a burst. Waiting for it to
/// finish turns the burst into a single look at what is connected.
#[cfg(target_os = "linux")]
const BURST_SETTLE: std::time::Duration = std::time::Duration::from_millis(300);

#[cfg(target_os = "linux")]
impl UdevWatcher {
    /// `None` when the monitor cannot be opened — no udev daemon, a container
    /// without one, a kernel without netlink. The app keeps working through the
    /// fallback rather than losing hotplug entirely.
    pub fn start() -> Option<Self> {
        match udev::MonitorBuilder::new()
            .and_then(|builder| builder.match_subsystem(HIDRAW_SUBSYSTEM))
            .and_then(udev::MonitorBuilder::listen)
        {
            Ok(socket) => Some(Self { socket }),
            Err(error) => {
                log::warn!("could not open the udev monitor: {error}");
                None
            }
        }
    }
}

#[cfg(target_os = "linux")]
impl DeviceWatcher for UdevWatcher {
    fn wait_for_change(&mut self) -> bool {
        loop {
            if self.socket.iter().next().is_some() {
                std::thread::sleep(BURST_SETTLE);
                let rest = self.socket.iter().count();
                log::debug!("udev reported a device change ({rest} more events in the burst)");
                return true;
            }

            std::thread::sleep(SOCKET_POLL);
        }
    }
}
