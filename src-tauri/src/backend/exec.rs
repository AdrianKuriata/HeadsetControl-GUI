//! The app's impure edges: spawning a process, opening a device node, watching
//! the kernel for hotplug events.
//!
//! Kept apart from the modules beside it on purpose: everything in
//! [`super::headsetcontrol`], [`super::detect`] and [`super::hotplug`] is pure
//! and gated at 100% coverage against recorded fixtures, which is only possible
//! because the calls to the outside world live behind [`CliRunner`],
//! [`DeviceAccess`] and [`DeviceWatcher`]. The coverage gate excludes this file
//! — what is left here is `std::process` and libudev — and the smoke E2E suite
//! (#14) covers the real invocation (ADR 0009, ADR 0011).
//!
//! The webview cannot reach any of this: there is no `shell:*` permission in the
//! Tauri ACL, so spawning `headsetcontrol` is Rust's job alone (ADR 0002).

use std::io::Read;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use super::detect::{Access, DeviceAccess};
use super::headsetcontrol::{CliOutput, CliRunner};
use super::hotplug::{DeviceWatcher, POLL_INTERVAL};

/// The program to run. Resolved against `PATH` by [`resolve`] rather than
/// handed to `Command::new` as a bare name — see there for why.
pub const BINARY: &str = "headsetcontrol";

/// How long one invocation may take before it is killed.
///
/// `headsetcontrol` answers in well under a second, but a headset asleep behind
/// its dongle makes it sit on usb timeouts first. Ten seconds is far past
/// anything healthy and still bounded, which is the point: without a limit a
/// wedged binary blocks its caller forever, and since the hotplug loop and the
/// value refresh both call in, forever means the app never recovers.
const CALL_TIMEOUT: Duration = Duration::from_secs(10);

/// How often the child is looked at while waiting. A healthy call is finished
/// within a tick or two, and a tick costs one `waitpid` that returns nothing.
const WAIT_TICK: Duration = Duration::from_millis(20);

/// Upper bound on what one invocation may hand back per stream.
///
/// Real output is a few kilobytes of json. Anything past this is a broken or
/// hostile binary and must not be able to fill memory. Reading continues past
/// the cap and discards the excess, because refusing to read would block the
/// child on a full pipe instead.
const MAX_OUTPUT_BYTES: usize = 1024 * 1024;

/// Runs the real `headsetcontrol` — one invocation at a time.
///
/// The serialisation is not incidental. The hotplug loop lists devices on its
/// own thread while the refresh loop reads values and the user writes
/// parameters, and all three end up at the same hidraw node. Letting two
/// invocations open it at once is what turns a working headset into a stream of
/// `Could not open device`.
#[derive(Debug, Default)]
pub struct ProcessRunner {
    serial: Mutex<()>,
}

impl ProcessRunner {
    pub fn new() -> Self {
        Self::default()
    }
}

impl CliRunner for ProcessRunner {
    fn run(&self, args: &[String]) -> Result<CliOutput, String> {
        // A poisoned lock means an earlier call panicked while holding it. What
        // it guards is `()`, so there is no state to have been corrupted, and
        // refusing every later call would be the worse failure of the two.
        let _serial = self
            .serial
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        let binary = resolve().ok_or_else(|| format!("{BINARY} was not found on PATH"))?;

        let mut child = Command::new(binary)
            .args(args)
            // Nothing is ever written to it, and an inherited stdin would let a
            // confused binary block on a read that never comes.
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| error.to_string())?;

        // Each stream is drained on its own thread: a child that fills one pipe
        // while this side waits on the other would deadlock.
        let stdout = child.stdout.take().map(capture);
        let stderr = child.stderr.take().map(capture);

        let outcome = wait_for(&mut child);

        // Joining cannot hang either way — the pipes reach EOF when the child
        // exits, and `wait_for` kills it before it gives up on one.
        let stdout = stdout.map(join).unwrap_or_default();
        let stderr = stderr.map(join).unwrap_or_default();

        outcome.map(|()| CliOutput { stdout, stderr })
    }
}

/// Finds the binary on `PATH`, in absolute directories only.
///
/// `Command::new(BINARY)` would leave the lookup to the OS, and on Windows that
/// search begins in the current working directory; a relative `PATH` entry has
/// the same effect everywhere. Both let whoever can write next to the app decide
/// what gets executed, so neither is consulted here.
///
/// Resolved per call rather than cached: "install it, then press check again"
/// has to keep working without a restart.
fn resolve() -> Option<PathBuf> {
    let name = format!("{BINARY}{}", std::env::consts::EXE_SUFFIX);

    search(&std::env::var_os("PATH")?, &name)
}

/// The lookup itself, against a `PATH` handed in. Split out from [`resolve`] so
/// the rule that carries the weight — a relative entry is never a candidate —
/// can be tested without depending on the machine's own environment.
fn search(path: &std::ffi::OsStr, name: &str) -> Option<PathBuf> {
    std::env::split_paths(path)
        .filter(|directory| directory.is_absolute())
        .map(|directory| directory.join(name))
        .find(|candidate| candidate.is_file())
}

/// Waits for the child, killing it if it outstays [`CALL_TIMEOUT`].
fn wait_for(child: &mut Child) -> Result<(), String> {
    let deadline = Instant::now() + CALL_TIMEOUT;

    loop {
        match child.try_wait() {
            // The exit status is deliberately dropped: `headsetcontrol` exits 0
            // even for a write that failed, so what happened is decided by
            // parsing its output and never by this (ADR 0009).
            Ok(Some(_)) => return Ok(()),
            Err(error) => return Err(error.to_string()),
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "{BINARY} did not answer within {} s",
                    CALL_TIMEOUT.as_secs()
                ));
            }
            Ok(None) => std::thread::sleep(WAIT_TICK),
        }
    }
}

fn capture(source: impl Read + Send + 'static) -> JoinHandle<String> {
    std::thread::spawn(move || read_capped(source))
}

/// A reader thread that panicked leaves the stream empty rather than taking the
/// call down with it — the parser reports empty output as a failure anyway.
fn join(handle: JoinHandle<String>) -> String {
    handle.join().unwrap_or_default()
}

/// Reads a stream to its end, keeping at most [`MAX_OUTPUT_BYTES`] of it.
fn read_capped(mut source: impl Read) -> String {
    let mut kept = Vec::new();
    let mut chunk = [0u8; 8 * 1024];

    loop {
        match source.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(read) => {
                // Past the cap this keeps nothing but goes on reading, which is
                // what stops the child blocking on a pipe nobody drains.
                let room = MAX_OUTPUT_BYTES.saturating_sub(kept.len());
                kept.extend_from_slice(&chunk[..read.min(room)]);
            }
        }
    }

    // Not `from_utf8`: a device name can carry whatever bytes its firmware
    // holds, and a stray byte must not turn a good reading into an error.
    String::from_utf8_lossy(&kept).into_owned()
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

#[cfg(test)]
mod tests {
    use super::*;

    // The coverage gate ignores this file (it is the process spawn), so these
    // do not count toward it. They are here because the output cap is the one
    // piece of logic in it that a fixture cannot reach: it takes a stream
    // larger than any real `headsetcontrol` ever produces.

    #[test]
    fn keeps_output_that_fits_under_the_cap() {
        assert_eq!(
            read_capped(b"{\"devices\": []}".as_slice()),
            "{\"devices\": []}"
        );
    }

    #[test]
    fn caps_a_stream_that_will_not_stop() {
        let flood = vec![b'x'; MAX_OUTPUT_BYTES * 2];

        assert_eq!(read_capped(flood.as_slice()).len(), MAX_OUTPUT_BYTES);
    }

    #[test]
    fn replaces_bytes_that_are_not_utf8_instead_of_failing() {
        // A device name carries whatever its firmware holds.
        assert_eq!(read_capped([b'A', 0xff, b'B'].as_slice()), "A\u{fffd}B");
    }

    /// A directory holding one planted file, removed when the test ends.
    struct Planted {
        directory: PathBuf,
        name: String,
    }

    impl Planted {
        fn new(name: &str) -> Self {
            let directory = std::env::temp_dir().join(format!("headset-deck-{name}"));
            std::fs::create_dir_all(&directory).unwrap();
            std::fs::write(directory.join(name), b"#!/bin/sh\n").unwrap();

            Self {
                directory,
                name: name.to_owned(),
            }
        }
    }

    impl Drop for Planted {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.directory);
        }
    }

    fn path_of(entries: &[&std::path::Path]) -> std::ffi::OsString {
        std::env::join_paths(entries).unwrap()
    }

    #[test]
    fn takes_the_first_absolute_path_entry_that_has_the_binary() {
        let planted = Planted::new("found-here");
        let path = path_of(&[std::path::Path::new("/nonexistent"), &planted.directory]);

        assert_eq!(
            search(&path, &planted.name),
            Some(planted.directory.join(&planted.name))
        );
    }

    #[test]
    fn never_takes_the_binary_from_a_relative_path_entry() {
        // The hijack this guards against: an entry the OS would resolve against
        // the current working directory. Cargo runs a test binary with that set
        // to the crate root, so `.` here really does hold `Cargo.toml` — and
        // `search` must still refuse to look in it.
        let cwd_entry = path_of(&[std::path::Path::new(".")]);

        assert!(std::path::Path::new("Cargo.toml").is_file());
        assert_eq!(search(&cwd_entry, "Cargo.toml"), None);
    }

    #[test]
    fn ignores_a_path_entry_that_names_no_directory_at_all() {
        let nowhere = path_of(&[std::path::Path::new("/nonexistent")]);

        assert_eq!(search(&nowhere, BINARY), None);
    }
}
