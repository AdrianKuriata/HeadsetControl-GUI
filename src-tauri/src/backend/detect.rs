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

/// The oldest `headsetcontrol` this app accepts.
///
/// `4.1.0` (2026-08-27) is the first release in which a parameter write costs
/// what a write should. Older releases read every info capability before
/// answering a structured-output invocation, so writing one value through this
/// app took **2.90 s** on a Maxwell 2 against **0.07 s** here
/// (Sapd/HeadsetControl#549), and each info capability cost its own 21-packet
/// status sequence (#550). `4.0.0` still talks to the hardware; it is simply
/// slow enough that this app behaves materially worse on it.
///
/// It bounds the *floor*, not the format: `4.1.0` bumps the CLI's own
/// `api_version` to 1.5 because a write no longer reports info values, and that
/// is the whole of the change the adapter sees.
const MIN_VERSION: Version = Version {
    major: 4,
    minor: 1,
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
    /// A binary that is too old, or one whose output this app cannot read at
    /// all. `found` is `None` in the second case: an incompatible binary is a
    /// clear screen rather than an invented version number.
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

/// Turns a version and a device list into a verdict.
///
/// `version` is what the CLI reported about itself (`None` when its output
/// carried no version at all); `devices` is what the same call listed.
pub fn diagnose(
    version: Option<&str>,
    devices: &[Device],
    access: &impl DeviceAccess,
) -> Detection {
    if !is_supported(version) {
        return Detection::BadVersion {
            found: version.map(str::to_owned),
            required: required_version(),
        };
    }

    if denies_every_device(devices, access) {
        return Detection::NoPermissions;
    }

    Detection::Ready
}

/// A version this app can work with?
///
/// A build that does not name a release — `continuous-53-gcfa125d`, what a git
/// checkout used to produce — is **accepted**: it cannot be compared, and a
/// checkout of `main` is by definition newer than the tag this gate names, not
/// older. Refusing it would lock out everyone tracking upstream, this app's own
/// developers first.
///
/// Since Sapd/HeadsetControl#551 such a build names the tag it grew from
/// (`4.1.0-12-gca98ed4`), so it takes the comparable path instead and is judged
/// on that tag. One built between `4.0.0` and `4.1.0` is therefore rejected as
/// `4.0.0` — correct, since it predates the work the floor exists for.
fn is_supported(version: Option<&str>) -> bool {
    match version.map(Version::parse) {
        Some(Some(found)) => found >= MIN_VERSION,
        Some(None) => {
            log::info!("headsetcontrol reports an uncomparable version, assuming it is new enough");
            true
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
    /// development build, or a string this app has never seen.
    fn parse(raw: &str) -> Option<Self> {
        // `3.1.0-rc1` is release 3.1.0 for ordering purposes; pre-release
        // ranking is a precision this app has no use for.
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

    #[test]
    fn accepts_the_minimum_version_and_anything_newer() {
        for version in ["4.1.0", "4.1.1", "4.2.0", "5.0.0", "v4.1.0", " 4.1.0 "] {
            assert_eq!(
                diagnose(Some(version), &[], &FakeAccess::all(Access::Granted)),
                Detection::Ready,
                "{version} should be accepted"
            );
        }
    }

    #[test]
    fn rejects_a_release_older_than_the_minimum() {
        for version in ["4.0.0", "4.0.1", "3.1.0", "2.6", "3", "0.0.1"] {
            assert_eq!(
                diagnose(Some(version), &[], &FakeAccess::all(Access::Granted)),
                Detection::BadVersion {
                    found: Some(version.to_owned()),
                    required: "4.1.0".to_owned(),
                },
                "{version} should be rejected"
            );
        }
    }

    #[test]
    fn ranks_a_pre_release_as_its_release() {
        assert_eq!(
            diagnose(Some("4.1.0-rc1"), &[], &FakeAccess::all(Access::Granted)),
            Detection::Ready
        );
        assert_eq!(
            diagnose(Some("4.0.0+build7"), &[], &FakeAccess::all(Access::Granted)),
            Detection::BadVersion {
                found: Some("4.0.0+build7".to_owned()),
                required: "4.1.0".to_owned(),
            }
        );
    }

    #[test]
    fn ranks_a_git_build_as_the_tag_it_was_built_from() {
        // Upstream #551 made a git build name itself `<tag>-<n>-g<hash>` rather
        // than `continuous-<n>-g<hash>`, so it is compared instead of waved
        // through: a build after the floor passes, one from before it does not.
        assert_eq!(
            diagnose(
                Some("4.1.0-12-gca98ed4"),
                &[],
                &FakeAccess::all(Access::Granted)
            ),
            Detection::Ready
        );
        assert_eq!(
            diagnose(
                Some("4.0.0-57-gdeadbee"),
                &[],
                &FakeAccess::all(Access::Granted)
            ),
            Detection::BadVersion {
                found: Some("4.0.0-57-gdeadbee".to_owned()),
                required: "4.1.0".to_owned(),
            }
        );
    }

    #[test]
    fn accepts_a_development_build_it_cannot_compare() {
        // What a `git clone` + `make install` reports. Still accepted after the
        // floor moved to a real release: a build from `main` is newer than any
        // tag, and refusing it would lock out the developers of this very app.
        for version in [
            "continuous-53-gcfa125d",
            "continuous-52-gfe086cd-modified",
            "unreleased",
        ] {
            assert_eq!(
                diagnose(Some(version), &[], &FakeAccess::all(Access::Granted)),
                Detection::Ready,
                "{version} should be accepted"
            );
        }
    }

    #[test]
    fn treats_output_without_a_version_as_an_incompatible_binary() {
        assert_eq!(
            diagnose(None, &maxwell(), &FakeAccess::all(Access::Granted)),
            Detection::BadVersion {
                found: None,
                required: "4.1.0".to_owned(),
            }
        );
    }

    #[test]
    fn prints_the_required_version_the_way_the_screen_shows_it() {
        assert_eq!(required_version(), "4.1.0");
    }

    // ── permissions ─────────────────────────────────────────────────────────

    #[test]
    fn blames_udev_only_when_every_listed_device_refuses_to_open() {
        assert_eq!(
            diagnose(Some("4.1.0"), &maxwell(), &FakeAccess::all(Access::Denied)),
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

        assert_eq!(diagnose(Some("4.1.0"), &devices, &access), Detection::Ready);
    }

    #[test]
    fn does_not_blame_udev_for_a_device_the_os_says_nothing_about() {
        assert_eq!(
            diagnose(Some("4.1.0"), &maxwell(), &FakeAccess::all(Access::Unknown)),
            Detection::Ready
        );
    }

    #[test]
    fn does_not_blame_udev_when_nothing_is_connected() {
        // Nothing to open is `no-device`, and that is the device list's verdict
        // to give, not this one's.
        assert_eq!(
            diagnose(Some("4.1.0"), &[], &FakeAccess::all(Access::Denied)),
            Detection::Ready
        );
    }

    #[test]
    fn checks_the_version_before_it_checks_permissions() {
        // An old binary is worth reporting even if it cannot open anything —
        // upgrading may well be what fixes the access too.
        assert_eq!(
            diagnose(Some("3.1.0"), &maxwell(), &FakeAccess::all(Access::Denied)),
            Detection::BadVersion {
                found: Some("3.1.0".to_owned()),
                required: "4.1.0".to_owned(),
            }
        );
    }
}
