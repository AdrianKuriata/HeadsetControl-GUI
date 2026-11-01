//! Startup detection: is the `headsetcontrol` behind the adapter usable at all?
//!
//! Three questions, in the order the state machine asks them (PROJECT.md §3.3):
//! is there a binary, is it new enough, and can it actually reach the hardware.
//! The first is answered by the [`super::headsetcontrol::CliRunner`] failing to
//! run anything; the other two are decided here.
//!
//! Everything in this file is pure: the one impure part — looking at device
//! nodes — is injected as [`DeviceAccess`], exactly like the CLI is, so the
//! whole diagnosis is tested from fixtures with no hardware attached.

use super::Device;

/// The oldest `headsetcontrol` release this app accepts.
///
/// `4.2.0` is the first release without the parameter-setting packet that 4.0.0
/// and 4.1.0 send on every status read of an Audeze Maxwell: it permanently
/// shifts the headset's audio balance, and only a factory reset in Audeze HQ
/// undoes it (Sapd/HeadsetControl#561, removed in #577). This app reads status
/// every few seconds, so on those releases it would send that packet
/// constantly (ADR 0017).
const MIN_VERSION: Version = Version {
    major: 4,
    minor: 2,
    patch: 0,
};

/// Whether the app may talk to a device node.
///
/// `Unknown` is not a failure: a headset the OS exposes some other way (or a
/// platform with no device nodes to look at) must never be reported as a
/// permission problem — the app would be telling the user to fix something that
/// is not broken.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    Granted,
    Denied,
    Unknown,
}

/// Can this machine's user reach the device behind `(vendor_id, product_id)`?
///
/// Injected rather than called directly: the real implementation reads device
/// nodes and is therefore OS-specific, which is only allowed outside the core
/// (PROJECT.md §7). It lives in [`super::exec`] next to the process spawn.
pub trait DeviceAccess: Send + Sync {
    fn access(&self, vendor_id: u16, product_id: u16) -> Access;
}

/// What the startup probe concluded. Each variant is a state of the frontend's
/// state machine, so this type *is* the detection contract with the UI.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum Detection {
    /// A usable binary; the devices it reports can be read.
    Ready,
    /// Nothing to run — not installed, or not on `PATH`.
    MissingBinary,
    /// A binary that is too old, whose version cannot be compared, or whose
    /// output this app cannot read at all. `found` is `None` in the last case:
    /// an incompatible binary is a clear screen rather than an invented version
    /// number.
    BadVersion {
        found: Option<String>,
        required: String,
    },
    /// The binary works and lists devices, but every one of them refuses to
    /// open — the udev rule is missing.
    NoPermissions,
}

/// The minimum version, as the UI prints it.
pub fn required_version() -> String {
    MIN_VERSION.to_string()
}

/// Is a binary calling itself `version` safe to let near a headset? Asked
/// before anything that reads a device, because on an unsafe binary that read
/// is the damage.
///
/// `version` is what `headsetcontrol --version` printed, `None` when it printed
/// nothing this app recognises.
pub fn vet(version: Option<&str>) -> Result<(), Detection> {
    if is_supported(version) {
        return Ok(());
    }

    Err(Detection::BadVersion {
        found: version.map(str::to_owned),
        required: required_version(),
    })
}

/// Turns the device list of a vetted binary into a verdict.
pub fn diagnose(devices: &[Device], access: &impl DeviceAccess) -> Detection {
    if denies_every_device(devices, access) {
        return Detection::NoPermissions;
    }

    Detection::Ready
}

/// A version this app can work with?
///
/// A git build names the tag it grew from (`4.2.0-3-gabcdef0`) and is judged on
/// it. One that cannot be compared at all — `continuous-52-gfe086cd`, what a
/// checkout produced before upstream #551 — is **refused**: nothing tells
/// whether it sends the packet, and every one this app has met does.
fn is_supported(version: Option<&str>) -> bool {
    match version.map(Version::parse) {
        Some(Some(found)) => found >= MIN_VERSION,
        Some(None) => {
            log::info!("headsetcontrol reports an uncomparable version, refusing it");
            false
        }
        None => false,
    }
}

/// Permissions are only ever *diagnosed*, never guessed: it takes at least one
/// device, all of them refusing to open, to blame udev. Anything the OS will
/// not answer for leaves the app alone (PROJECT.md §7 — no Linux assumptions in
/// the verdict itself).
fn denies_every_device(devices: &[Device], access: &impl DeviceAccess) -> bool {
    !devices.is_empty()
        && devices
            .iter()
            .all(|device| access.access(device.vendor_id, device.product_id) == Access::Denied)
}

/// A release version, compared the way SemVer orders releases.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct Version {
    major: u32,
    minor: u32,
    patch: u32,
}

impl Version {
    /// `None` for anything that does not start with a release number — a
    /// `continuous-…` build, or a string this app has never seen.
    fn parse(raw: &str) -> Option<Self> {
        // `4.2.0-rc1` is release 4.2.0 for ordering purposes, and so is a git
        // build on top of it; finer ranking is a precision this app has no use for.
        let raw = raw.trim().trim_start_matches('v');
        let release = &raw[..raw.find(['-', '+']).unwrap_or(raw.len())];
        let mut parts = release.split('.');

        Some(Self {
            major: number(parts.next())?,
            // A binary calling itself `2.6` is version 2.6.0.
            minor: number(parts.next()).unwrap_or(0),
            patch: number(parts.next()).unwrap_or(0),
        })
    }
}

fn number(part: Option<&str>) -> Option<u32> {
    part.and_then(|part| part.parse().ok())
}

impl std::fmt::Display for Version {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAXWELL: (u16, u16) = (0x3329, 0x4b28);

    /// Answers for the devices it was told about, `Unknown` for the rest.
    struct FakeAccess(Vec<((u16, u16), Access)>);

    impl FakeAccess {
        fn all(access: Access) -> Self {
            Self(vec![(MAXWELL, access)])
        }
    }

    impl DeviceAccess for FakeAccess {
        fn access(&self, vendor_id: u16, product_id: u16) -> Access {
            self.0
                .iter()
                .find(|(id, _)| *id == (vendor_id, product_id))
                .map(|(_, access)| *access)
                .unwrap_or(Access::Unknown)
        }
    }

    fn device(vendor_id: u16, product_id: u16) -> Device {
        Device {
            id: format!("{vendor_id:04x}:{product_id:04x}"),
            name: "Test Headset".to_owned(),
            vendor: "Test".to_owned(),
            product: "Test".to_owned(),
            vendor_id,
            product_id,
            capabilities: Vec::new(),
        }
    }

    fn maxwell() -> Vec<Device> {
        vec![device(MAXWELL.0, MAXWELL.1)]
    }

    // ── versions ────────────────────────────────────────────────────────────

    fn refused(version: Option<&str>) -> Result<(), Detection> {
        Err(Detection::BadVersion {
            found: version.map(str::to_owned),
            required: "4.2.0".to_owned(),
        })
    }

    #[test]
    fn accepts_the_minimum_version_and_anything_newer() {
        for version in ["4.2.0", "4.2.1", "4.3.0", "5.0.0", "v4.2.0", " 4.2.0 "] {
            assert_eq!(vet(Some(version)), Ok(()), "{version} should be accepted");
        }
    }

    #[test]
    fn rejects_a_release_older_than_the_minimum() {
        // 4.1.0 included: it still sends the packet that shifts a Maxwell's
        // balance on every status read (Sapd/HeadsetControl#561).
        for version in ["4.1.1", "4.1.0", "4.0.0", "3.1.0", "2.6", "3", "0.0.1"] {
            assert_eq!(
                vet(Some(version)),
                refused(Some(version)),
                "{version} should be rejected"
            );
        }
    }

    #[test]
    fn ranks_a_pre_release_as_its_release() {
        assert_eq!(vet(Some("4.2.0-rc1")), Ok(()));
        assert_eq!(vet(Some("4.1.0+build7")), refused(Some("4.1.0+build7")));
    }

    #[test]
    fn ranks_a_git_build_as_the_tag_it_was_built_from() {
        for version in ["4.2.0-3-gabcdef0", "4.2.0-16-gfbbce84-modified"] {
            assert_eq!(vet(Some(version)), Ok(()), "{version} should be accepted");
        }
        for version in ["4.1.0-16-gfbbce84", "4.0.0-57-gdeadbee"] {
            assert_eq!(
                vet(Some(version)),
                refused(Some(version)),
                "{version} should be rejected"
            );
        }
    }

    #[test]
    fn rejects_a_build_it_cannot_compare() {
        // Nothing says whether such a build carries the packet — and the one
        // this app was developed against, `continuous-52`, does.
        for version in [
            "continuous-53-gcfa125d",
            "continuous-52-gfe086cd-modified",
            "unreleased",
        ] {
            assert_eq!(
                vet(Some(version)),
                refused(Some(version)),
                "{version} should be rejected"
            );
        }
    }

    #[test]
    fn treats_a_binary_that_names_no_version_as_incompatible() {
        assert_eq!(vet(None), refused(None));
    }

    #[test]
    fn prints_the_required_version_the_way_the_screen_shows_it() {
        assert_eq!(required_version(), "4.2.0");
    }

    // ── permissions ─────────────────────────────────────────────────────────

    #[test]
    fn blames_udev_only_when_every_listed_device_refuses_to_open() {
        assert_eq!(
            diagnose(&maxwell(), &FakeAccess::all(Access::Denied)),
            Detection::NoPermissions
        );
    }

    #[test]
    fn stays_ready_when_at_least_one_device_can_be_reached() {
        let devices = vec![device(MAXWELL.0, MAXWELL.1), device(0xf00b, 0xa00c)];
        let access = FakeAccess(vec![
            (MAXWELL, Access::Denied),
            ((0xf00b, 0xa00c), Access::Granted),
        ]);

        assert_eq!(diagnose(&devices, &access), Detection::Ready);
    }

    #[test]
    fn does_not_blame_udev_for_a_device_the_os_says_nothing_about() {
        assert_eq!(
            diagnose(&maxwell(), &FakeAccess::all(Access::Unknown)),
            Detection::Ready
        );
    }

    #[test]
    fn does_not_blame_udev_when_nothing_is_connected() {
        // Nothing to open is `no-device`, and that is the device list's verdict
        // to give, not this one's.
        assert_eq!(
            diagnose(&[], &FakeAccess::all(Access::Denied)),
            Detection::Ready
        );
    }
}
