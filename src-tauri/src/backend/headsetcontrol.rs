//! Adapter over the external `headsetcontrol` binary.
//!
//! Anti-corruption layer: the CLI's `--output json` is validated and mapped onto
//! the domain types in [`super`]; its own JSON shape never crosses the IPC
//! boundary. Rust stays free of model knowledge — the only headset vocabulary
//! here is the capability identifier, which is what a write is addressed by.
//!
//! Everything in this file is pure apart from the [`CliRunner`] call, and the
//! runner is injected: the one place that actually spawns a process lives in
//! [`super::exec`], which the coverage gate excludes. That is what lets the
//! parsing and mapping be tested against recorded fixtures with no binary
//! installed — including on CI.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Deserialize;

use super::detect::{self, Detection, DeviceAccess};
use super::{
    BackendError, Battery, BatteryStatus, Device, DeviceState, HeadsetBackend, ParamValue,
};

/// What a CLI invocation produced. Both streams are kept: `headsetcontrol`
/// exits 0 even when an operation failed, so the exit status carries no
/// information and the decision has to be made from the output itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliOutput {
    pub stdout: String,
    pub stderr: String,
}

/// Runs `headsetcontrol` with the given arguments.
///
/// Injected rather than called directly so the adapter can be driven from
/// fixtures. `Err` means the binary could not be run at all (missing, not
/// executable); a failed *operation* still comes back as `Ok` and is detected
/// by parsing.
pub trait CliRunner: Send + Sync {
    fn run(&self, args: &[String]) -> Result<CliOutput, String>;
}

/// How one capability is written: the flag that carries it and the values the
/// CLI will accept for it.
struct Write {
    capability: &'static str,
    flag: &'static str,
    /// Inclusive, and taken from upstream — see [`WRITE_FLAGS`].
    accepts: std::ops::RangeInclusive<i32>,
}

/// Capability → CLI flag and value range. This is the complete write vocabulary
/// of the adapter: a capability missing from the table cannot be written, and
/// asking for one is an error rather than a silent no-op.
///
/// Capability knowledge, not model knowledge — every headset that reports
/// `CAP_SIDETONE` is written the same way (PROJECT.md §3.1).
///
/// The ranges are copied from upstream's own single source of truth,
/// `lib/capability_descriptors.hpp` (`min_value`/`max_value`), so nothing here
/// is invented. They are a **sanity bound**, not a per-device limit: what a
/// particular headset really accepts within them is model knowledge and belongs
/// in `src/profiles/`. Rust is the last gate before the hardware, and PROJECT.md
/// §11 puts hardware safety above every feature, so a value outside the bound is
/// refused here rather than handed to the device.
const WRITE_FLAGS: &[Write] = &[
    Write {
        capability: "CAP_SIDETONE",
        flag: "-s",
        accepts: 0..=128,
    },
    Write {
        capability: "CAP_INACTIVE_TIME",
        flag: "-i",
        accepts: 0..=90,
    },
    Write {
        capability: "CAP_VOICE_PROMPTS",
        flag: "-v",
        accepts: 0..=1,
    },
    Write {
        capability: "CAP_NOISE_FILTER",
        flag: "--noise-filter",
        accepts: 0..=2,
    },
    Write {
        capability: "CAP_EQUALIZER_PRESET",
        flag: "-p",
        // Upstream calls its own maximum device-specific; which presets exist
        // is a profile's answer, not this layer's.
        accepts: 0..=255,
    },
    Write {
        capability: "CAP_LIGHTS",
        flag: "-l",
        accepts: 0..=1,
    },
    Write {
        capability: "CAP_NOTIFICATION_SOUND",
        flag: "-n",
        accepts: 0..=1,
    },
    Write {
        capability: "CAP_ROTATE_TO_MUTE",
        flag: "-r",
        accepts: 0..=1,
    },
    Write {
        capability: "CAP_MICROPHONE_MUTE_LED_BRIGHTNESS",
        flag: "--microphone-mute-led-brightness",
        accepts: 0..=3,
    },
    Write {
        capability: "CAP_MICROPHONE_VOLUME",
        flag: "--microphone-volume",
        accepts: 0..=128,
    },
    Write {
        capability: "CAP_VOLUME_LIMITER",
        flag: "--volume-limiter",
        accepts: 0..=1,
    },
    Write {
        capability: "CAP_BT_WHEN_POWERED_ON",
        flag: "--bt-when-powered-on",
        accepts: 0..=1,
    },
    Write {
        capability: "CAP_BT_CALL_VOLUME",
        flag: "--bt-call-volume",
        accepts: 0..=100,
    },
];

/// The `headsetcontrol` implementation of the [`HeadsetBackend`] seam.
///
/// Two things are injected, and for the same reason: the process spawn and the
/// look at device nodes are the only impure parts of talking to a headset, so
/// keeping both behind traits leaves everything here testable from fixtures.
///
/// Nothing that reads a device runs until [`HeadsetBackend::detect`] has
/// vetted the binary's version: on `headsetcontrol` ≤ 4.1.0 every such read
/// sends a packet that shifts a Maxwell's audio balance for good (ADR 0017).
/// Held here rather than in the frontend because the hotplug loop lists devices
/// on its own.
pub struct HeadsetControlBackend<R: CliRunner, A: DeviceAccess> {
    runner: R,
    access: A,
    vouched: AtomicBool,
}

impl<R: CliRunner, A: DeviceAccess> HeadsetControlBackend<R, A> {
    pub fn new(runner: R, access: A) -> Self {
        Self {
            runner,
            access,
            vouched: AtomicBool::new(false),
        }
    }

    /// [`HeadsetBackend::detect`], with every early verdict as an `Err`.
    fn vet_then_list(&self) -> Result<Detection, Detection> {
        self.vouched.store(false, Ordering::SeqCst);

        let version = self.run_or_missing("--version".to_owned())?;
        detect::vet(parse_version(&version.stdout))?;
        self.vouched.store(true, Ordering::SeqCst);

        let output = self.run_or_missing(json_output())?;

        // Output this build cannot read is an incompatible binary, not a
        // missing one.
        let raw = serde_json::from_str::<RawOutput>(&output.stdout).map_err(|_| {
            let complaint = output.stderr.trim();
            log::warn!("unreadable headsetcontrol output: {complaint}");
            Detection::BadVersion {
                found: None,
                required: detect::required_version(),
            }
        })?;

        // A device whose usb ids make no sense cannot be permission-checked;
        // dropping it here is not hiding anything, because `list_devices`
        // reports the same output as an error moments later.
        let devices: Vec<Device> = raw
            .devices
            .iter()
            .filter_map(|raw| to_device(raw).ok())
            .collect();

        Ok(detect::diagnose(&devices, &self.access))
    }

    fn run_or_missing(&self, arg: String) -> Result<CliOutput, Detection> {
        self.runner.run(&[arg]).map_err(|message| {
            log::info!("headsetcontrol could not be run: {message}");
            Detection::MissingBinary
        })
    }

    /// [`Self::output`] for a call that reaches a device — refused outright
    /// until a detection has vetted the binary.
    fn device_output(&self, args: &[String]) -> Result<String, BackendError> {
        if !self.vouched.load(Ordering::SeqCst) {
            return Err(BackendError::Failed {
                message: "headsetcontrol has not passed the version check".to_owned(),
            });
        }

        self.output(args)
    }

    /// Runs the CLI and hands back its stdout, having ruled out the two ways
    /// "it ran" still means "it did not work": the binary being unusable, and
    /// an empty stdout with a complaint on stderr (how the CLI reports a bad
    /// argument).
    fn output(&self, args: &[String]) -> Result<String, BackendError> {
        let output = self
            .runner
            .run(args)
            .map_err(|message| BackendError::Failed {
                message: format!("could not run headsetcontrol: {message}"),
            })?;

        if output.stdout.trim().is_empty() {
            let message = match output.stderr.trim() {
                "" => "headsetcontrol produced no output".to_owned(),
                stderr => stderr.to_owned(),
            };
            return Err(BackendError::Failed { message });
        }

        Ok(output.stdout)
    }
}

impl<R: CliRunner, A: DeviceAccess> HeadsetBackend for HeadsetControlBackend<R, A> {
    /// Two invocations, in an order that matters: `--version` only enumerates
    /// USB ids, while `--output=json` reads every device's status — which is
    /// exactly what an unsafe binary must never be asked to do.
    fn detect(&self) -> Detection {
        self.vet_then_list().unwrap_or_else(|verdict| verdict)
    }

    fn list_devices(&self) -> Result<Vec<Device>, BackendError> {
        parse_devices(&self.device_output(&[json_output()])?)
    }

    fn device_state(&self, device_id: &str) -> Result<DeviceState, BackendError> {
        // `-b`/`-m` ask for the readable values; the device is selected here
        // *and* filtered again while parsing, because `-d` silently falls back
        // to reporting every connected device when nothing matches it.
        let args = vec![
            "-d".to_owned(),
            cli_device_arg(device_id)?,
            "-b".to_owned(),
            "-m".to_owned(),
            json_output(),
        ];

        parse_state(&self.device_output(&args)?, device_id)
    }

    fn set_param(
        &self,
        device_id: &str,
        param: &str,
        value: ParamValue,
    ) -> Result<(), BackendError> {
        let write = WRITE_FLAGS
            .iter()
            .find(|write| write.capability == param)
            .ok_or_else(|| BackendError::Failed {
                message: format!("{param} cannot be written through headsetcontrol"),
            })?;

        let number = match value {
            ParamValue::Int(number) => number,
            ParamValue::Bool(true) => 1,
            ParamValue::Bool(false) => 0,
        };

        if !write.accepts.contains(&number) {
            return Err(BackendError::Failed {
                message: format!(
                    "{number} is outside the {}..={} that {param} accepts",
                    write.accepts.start(),
                    write.accepts.end()
                ),
            });
        }

        let args = vec![
            "-d".to_owned(),
            cli_device_arg(device_id)?,
            write.flag.to_owned(),
            number.to_string(),
            json_output(),
        ];

        parse_write(&self.device_output(&args)?, param)
    }
}

/// `HeadsetControl 4.1.0` → `4.1.0`; `None` for anything else, which is what
/// a binary too old or too foreign to name itself prints.
fn parse_version(stdout: &str) -> Option<&str> {
    stdout
        .trim()
        .strip_prefix("HeadsetControl ")
        .map(str::trim)
        .filter(|version| !version.is_empty())
}

fn json_output() -> String {
    "--output=json".to_owned()
}

/// Domain ids are `"3329:4b28"`; the CLI insists on `"0x3329:0x4b28"` and
/// rejects the bare form outright.
fn cli_device_arg(device_id: &str) -> Result<String, BackendError> {
    let malformed = || BackendError::Failed {
        message: format!("malformed device id: {device_id}"),
    };

    let (vendor, product) = device_id.split_once(':').ok_or_else(malformed)?;
    let vendor = u16::from_str_radix(vendor, 16).map_err(|_| malformed())?;
    let product = u16::from_str_radix(product, 16).map_err(|_| malformed())?;

    Ok(format!("0x{vendor:04x}:0x{product:04x}"))
}

// ── the CLI's own shape, private to this module ──────────────────────────────

#[derive(Deserialize)]
struct RawOutput {
    #[serde(default)]
    devices: Vec<RawDevice>,
    #[serde(default)]
    actions: Vec<RawAction>,
}

#[derive(Deserialize)]
struct RawDevice {
    device: String,
    vendor: String,
    product: String,
    id_vendor: String,
    id_product: String,
    #[serde(default)]
    capabilities: Vec<String>,
    battery: Option<RawBattery>,
    chatmix: Option<i32>,
    /// Present when the device answered but a value could not be read:
    /// `{"battery": "Could not open device"}`.
    #[serde(default)]
    errors: BTreeMap<String, String>,
}

#[derive(Deserialize)]
struct RawBattery {
    status: String,
    /// `-1` is the CLI's "no reading" sentinel, not a percentage.
    level: i32,
}

#[derive(Deserialize)]
struct RawAction {
    status: String,
    error_message: Option<String>,
}

fn parse(json: &str) -> Result<RawOutput, BackendError> {
    serde_json::from_str(json).map_err(|error| BackendError::Failed {
        message: format!("unreadable headsetcontrol output: {error}"),
    })
}

fn parse_devices(json: &str) -> Result<Vec<Device>, BackendError> {
    parse(json)?.devices.iter().map(to_device).collect()
}

fn to_device(raw: &RawDevice) -> Result<Device, BackendError> {
    let vendor_id = hex_id(&raw.id_vendor)?;
    let product_id = hex_id(&raw.id_product)?;

    Ok(Device {
        id: format!("{vendor_id:04x}:{product_id:04x}"),
        name: raw.device.clone(),
        vendor: raw.vendor.clone(),
        product: raw.product.clone(),
        vendor_id,
        product_id,
        // Capabilities stay opaque strings: one this build has never heard of
        // must reach the frontend untouched, which is what lets a newer
        // headsetcontrol add features without a Rust change.
        capabilities: raw.capabilities.clone(),
    })
}

/// `"0x3329"` — the CLI writes usb ids as prefixed hex strings, never as numbers.
fn hex_id(raw: &str) -> Result<u16, BackendError> {
    let digits = raw.strip_prefix("0x").unwrap_or(raw);

    u16::from_str_radix(digits, 16).map_err(|_| BackendError::Failed {
        message: format!("unreadable usb id: {raw}"),
    })
}

fn parse_state(json: &str, device_id: &str) -> Result<DeviceState, BackendError> {
    let output = parse(json)?;
    let raw = output
        .devices
        .iter()
        .find(|raw| matches_id(raw, device_id))
        .ok_or_else(|| BackendError::Failed {
            message: format!("device {device_id} is not connected"),
        })?;

    if !raw.errors.is_empty() {
        // A partial read: the dongle answered but the headset behind it did
        // not. Confirmed against hardware — a powered-off Maxwell 2 reports
        // `Could not open device` for battery and chatmix, and reports real
        // values the moment it is switched on, with no other change. Missing
        // udev permissions look the same from here, which is why this is not
        // turned into a diagnosis: the value is reported as absent rather than
        // invented, and #9 tells the two apart.
        log::warn!(
            "headsetcontrol could not read {device_id}: {:?}",
            raw.errors
        );
    }

    Ok(DeviceState {
        battery: raw.battery.as_ref().map(to_battery),
        chatmix: raw.chatmix.and_then(|value| u8::try_from(value).ok()),
    })
}

fn matches_id(raw: &RawDevice, device_id: &str) -> bool {
    match (hex_id(&raw.id_vendor), hex_id(&raw.id_product)) {
        (Ok(vendor), Ok(product)) => format!("{vendor:04x}:{product:04x}") == device_id,
        _ => false,
    }
}

fn to_battery(raw: &RawBattery) -> Battery {
    let status = match raw.status.as_str() {
        "BATTERY_AVAILABLE" => BatteryStatus::Available,
        "BATTERY_CHARGING" => BatteryStatus::Charging,
        // Anything else — including a status a newer CLI invents — is treated
        // as "no reading" rather than as a parse failure.
        _ => BatteryStatus::Unavailable,
    };

    Battery {
        status,
        level: match status {
            BatteryStatus::Available => u8::try_from(raw.level).ok(),
            _ => None,
        },
    }
}

/// A write reports itself in `actions`, one entry per device the CLI touched,
/// each with its own status. The process exit code is always 0, so this is the
/// only place a failed write can be seen.
fn parse_write(json: &str, param: &str) -> Result<(), BackendError> {
    let actions = parse(json)?.actions;

    if actions.is_empty() {
        return Err(BackendError::Failed {
            message: format!("headsetcontrol reported no result for {param}"),
        });
    }

    match actions.iter().find(|action| action.status != "success") {
        None => Ok(()),
        Some(failed) => Err(BackendError::Failed {
            message: failed
                .error_message
                .clone()
                .unwrap_or_else(|| format!("writing {param} failed")),
        }),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::Ordering;

    use super::*;

    const HEALTHY: &str = include_str!("../../../docs/fixtures/maxwell2-xbox-output-json.json");
    const PARTIAL: &str = include_str!("../../../docs/fixtures/maxwell2-xbox-partial-errors.json");
    const MULTI: &str = include_str!("../../../docs/fixtures/test-device-multi.json");
    const WRITE: &str = include_str!("../../../docs/fixtures/write-actions-mixed.json");
    const EMPTY: &str = include_str!("../../../docs/fixtures/no-devices.json");
    const UNKNOWN_CAP: &str = include_str!("../../../docs/fixtures/unknown-capability.json");
    const MALFORMED: &str = include_str!("../../../docs/fixtures/malformed-truncated.json");
    /// `headsetcontrol --version` from the release the fixtures were recorded with.
    const VERSION_RELEASE: &str = include_str!("../../../docs/fixtures/version-release.txt");
    /// What that release calls itself.
    const RECORDED_VERSION: &str = "4.2.0";
    /// A release that sends the packet the version gate exists for.
    const UNSAFE_VERSION: &str = "4.1.0";

    /// What `--version` prints for a binary calling itself `version`.
    fn version_line(version: &str) -> String {
        VERSION_RELEASE.replace(RECORDED_VERSION, version)
    }

    const MAXWELL: &str = "3329:4b28";

    /// Replays recorded output and records what the adapter asked for.
    /// `--version` gets its own answer — the recorded build's, unless a test
    /// says otherwise — and either answer can be changed mid-test.
    struct FakeRunner {
        stdout: String,
        stderr: String,
        version: std::sync::Mutex<String>,
        error: std::sync::Mutex<Option<String>>,
        /// Fails every call but `--version` — gone between the two.
        vanishing: std::sync::Mutex<Option<String>>,
        calls: std::sync::Mutex<Vec<Vec<String>>>,
    }

    impl FakeRunner {
        fn replaying(stdout: &str) -> Self {
            Self {
                stdout: stdout.to_owned(),
                stderr: String::new(),
                version: std::sync::Mutex::new(version_line(RECORDED_VERSION)),
                error: std::sync::Mutex::new(None),
                vanishing: std::sync::Mutex::new(None),
                calls: std::sync::Mutex::new(Vec::new()),
            }
        }

        fn complaining(stderr: &str) -> Self {
            Self {
                stderr: stderr.to_owned(),
                ..Self::replaying("")
            }
        }

        fn failing(error: &str) -> Self {
            let runner = Self::replaying("");
            runner.fail_with(error);
            runner
        }

        /// From now on `--version` prints `stdout`.
        fn report_version(&self, stdout: &str) {
            *self.version.lock().unwrap() = stdout.to_owned();
        }

        /// From now on nothing can be run.
        fn fail_with(&self, error: &str) {
            *self.error.lock().unwrap() = Some(error.to_owned());
        }

        /// Runnable again, answering as before.
        fn reinstall(&self) {
            *self.error.lock().unwrap() = None;
        }

        fn calls(&self) -> Vec<Vec<String>> {
            self.calls.lock().unwrap().clone()
        }

        fn last_call(&self) -> Vec<String> {
            self.calls().last().cloned().unwrap_or_default()
        }
    }

    impl CliRunner for FakeRunner {
        fn run(&self, args: &[String]) -> Result<CliOutput, String> {
            self.calls.lock().unwrap().push(args.to_vec());

            if let Some(error) = self.error.lock().unwrap().clone() {
                return Err(error);
            }

            let stdout = if args == ["--version"] {
                self.version.lock().unwrap().clone()
            } else if let Some(error) = self.vanishing.lock().unwrap().clone() {
                return Err(error);
            } else {
                self.stdout.clone()
            };

            Ok(CliOutput {
                stdout,
                stderr: self.stderr.clone(),
            })
        }
    }

    /// Whatever the adapter asks about a device node, it is told the same thing.
    struct FakeAccess(detect::Access);

    impl DeviceAccess for FakeAccess {
        fn access(&self, _vendor_id: u16, _product_id: u16) -> detect::Access {
            self.0
        }
    }

    /// A backend a detection has already vouched for, which is the only kind
    /// that reaches a device.
    fn backend(stdout: &str) -> HeadsetControlBackend<FakeRunner, FakeAccess> {
        let backend = with_access(FakeRunner::replaying(stdout), detect::Access::Granted);
        backend.vouched.store(true, Ordering::SeqCst);
        backend
    }

    fn with_access(
        runner: FakeRunner,
        access: detect::Access,
    ) -> HeadsetControlBackend<FakeRunner, FakeAccess> {
        HeadsetControlBackend::new(runner, FakeAccess(access))
    }

    // ── contract tests on recorded output ────────────────────────────────────

    #[test]
    fn maps_a_healthy_device_onto_the_domain_type() {
        assert_eq!(
            parse_devices(HEALTHY).unwrap(),
            vec![Device {
                id: MAXWELL.to_owned(),
                name: "Audeze Maxwell 2".to_owned(),
                vendor: "Audeze LLC".to_owned(),
                product: "Audeze Maxwell XBOX Dongle".to_owned(),
                vendor_id: 0x3329,
                product_id: 0x4b28,
                capabilities: vec![
                    "CAP_SIDETONE".to_owned(),
                    "CAP_BATTERY_STATUS".to_owned(),
                    "CAP_INACTIVE_TIME".to_owned(),
                    "CAP_CHATMIX_STATUS".to_owned(),
                    "CAP_VOICE_PROMPTS".to_owned(),
                    "CAP_EQUALIZER_PRESET".to_owned(),
                    "CAP_NOISE_FILTER".to_owned(),
                    "CAP_SIDETONE_STATUS".to_owned(),
                ],
            }]
        );
    }

    #[test]
    fn lists_every_device_the_cli_reports() {
        let devices = parse_devices(MULTI).unwrap();

        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].id, "f00b:a00c");
        assert_eq!(devices[1].id, MAXWELL);
    }

    #[test]
    fn reports_no_devices_as_an_empty_list_not_an_error() {
        assert_eq!(parse_devices(EMPTY).unwrap(), Vec::new());
    }

    #[test]
    fn passes_an_unrecognised_capability_through_untouched() {
        let devices = parse_devices(UNKNOWN_CAP).unwrap();

        assert!(
            devices[0]
                .capabilities
                .contains(&"CAP_FROM_THE_FUTURE".to_owned())
        );
    }

    #[test]
    fn rejects_output_it_cannot_read() {
        let error = parse_devices(MALFORMED).unwrap_err();

        assert!(
            matches!(&error, BackendError::Failed { message }
                if message.starts_with("unreadable headsetcontrol output")),
            "unexpected error: {error:?}"
        );
    }

    #[test]
    fn rejects_a_device_whose_usb_id_is_not_hex() {
        for id in ["\"0x3329\"", "\"0x4b28\""] {
            let json = HEALTHY.replace(id, "\"not-hex\"");

            assert_eq!(
                parse_devices(&json).unwrap_err(),
                BackendError::Failed {
                    message: "unreadable usb id: not-hex".to_owned()
                }
            );
        }
    }

    #[test]
    fn rejects_unreadable_output_wherever_it_is_parsed() {
        assert!(parse_state(MALFORMED, MAXWELL).is_err());
        assert!(parse_write(MALFORMED, "CAP_SIDETONE").is_err());
    }

    // ── state ───────────────────────────────────────────────────────────────

    #[test]
    fn reads_battery_and_chatmix_of_the_selected_device() {
        assert_eq!(
            parse_state(HEALTHY, MAXWELL).unwrap(),
            DeviceState {
                battery: Some(Battery {
                    status: BatteryStatus::Available,
                    level: Some(27),
                }),
                chatmix: Some(64),
            }
        );
    }

    #[test]
    fn reports_a_charging_battery_without_inventing_a_level() {
        assert_eq!(
            parse_state(UNKNOWN_CAP, MAXWELL).unwrap().battery,
            Some(Battery {
                status: BatteryStatus::Charging,
                level: None,
            })
        );
    }

    #[test]
    fn turns_the_no_reading_sentinel_into_an_absent_level() {
        let state = parse_state(PARTIAL, MAXWELL).unwrap();

        assert_eq!(
            state.battery,
            Some(Battery {
                status: BatteryStatus::Unavailable,
                level: None,
            })
        );
        assert_eq!(state.chatmix, None);
    }

    #[test]
    fn treats_an_unheard_of_battery_status_as_no_reading() {
        let json = HEALTHY.replace("BATTERY_AVAILABLE", "BATTERY_FROM_THE_FUTURE");

        assert_eq!(
            parse_state(&json, MAXWELL).unwrap().battery,
            Some(Battery {
                status: BatteryStatus::Unavailable,
                level: None,
            })
        );
    }

    #[test]
    fn ignores_a_chatmix_reading_outside_the_byte_range() {
        let json = HEALTHY.replace("\"chatmix\": 64", "\"chatmix\": -1");

        assert_eq!(parse_state(&json, MAXWELL).unwrap().chatmix, None);
    }

    #[test]
    fn refuses_to_report_state_for_a_device_that_is_not_there() {
        assert_eq!(
            parse_state(HEALTHY, "dead:beef").unwrap_err(),
            BackendError::Failed {
                message: "device dead:beef is not connected".to_owned()
            }
        );
    }

    #[test]
    fn skips_devices_whose_ids_cannot_be_compared() {
        let json = HEALTHY.replace("\"0x3329\"", "\"not-hex\"");

        assert!(parse_state(&json, MAXWELL).is_err());
    }

    // ── writes ──────────────────────────────────────────────────────────────

    #[test]
    fn surfaces_the_failure_the_cli_recorded_for_a_write() {
        assert_eq!(
            parse_write(WRITE, "CAP_SIDETONE").unwrap_err(),
            BackendError::Failed {
                message: "HID communication error".to_owned()
            }
        );
    }

    #[test]
    fn accepts_a_write_every_device_confirmed() {
        let json = WRITE.replace("\"failure\"", "\"success\"");

        assert_eq!(parse_write(&json, "CAP_SIDETONE"), Ok(()));
    }

    #[test]
    fn describes_a_failure_the_cli_left_unexplained() {
        let json = WRITE.replace(
            "\"error_message\": \"HID communication error\"",
            "\"value\": 0",
        );

        assert_eq!(
            parse_write(&json, "CAP_SIDETONE").unwrap_err(),
            BackendError::Failed {
                message: "writing CAP_SIDETONE failed".to_owned()
            }
        );
    }

    #[test]
    fn refuses_to_call_a_write_successful_when_nothing_was_reported() {
        assert_eq!(
            parse_write(EMPTY, "CAP_SIDETONE").unwrap_err(),
            BackendError::Failed {
                message: "headsetcontrol reported no result for CAP_SIDETONE".to_owned()
            }
        );
    }

    // ── the adapter's own behaviour ─────────────────────────────────────────

    #[test]
    fn asks_the_cli_for_json() {
        let backend = backend(HEALTHY);

        backend.list_devices().unwrap();

        assert_eq!(backend.runner.last_call(), vec!["--output=json".to_owned()]);
    }

    #[test]
    fn selects_the_device_in_the_form_the_cli_demands() {
        let backend = backend(HEALTHY);

        backend.device_state(MAXWELL).unwrap();

        assert_eq!(
            backend.runner.last_call(),
            vec!["-d", "0x3329:0x4b28", "-b", "-m", "--output=json"]
        );
    }

    #[test]
    fn writes_an_integer_parameter_with_the_capability_s_flag() {
        let backend = backend(WRITE);

        let _ = backend.set_param(MAXWELL, "CAP_SIDETONE", ParamValue::Int(64));

        assert_eq!(
            backend.runner.last_call(),
            vec!["-d", "0x3329:0x4b28", "-s", "64", "--output=json"]
        );
    }

    #[test]
    fn writes_a_boolean_parameter_as_the_cli_s_zero_or_one() {
        let backend = backend(WRITE);

        let _ = backend.set_param(MAXWELL, "CAP_VOICE_PROMPTS", ParamValue::Bool(true));
        assert_eq!(backend.runner.last_call()[3], "1");

        let _ = backend.set_param(MAXWELL, "CAP_VOICE_PROMPTS", ParamValue::Bool(false));
        assert_eq!(backend.runner.last_call()[3], "0");
    }

    #[test]
    fn refuses_a_capability_it_cannot_write() {
        assert_eq!(
            backend(WRITE).set_param(MAXWELL, "CAP_BATTERY_STATUS", ParamValue::Int(1)),
            Err(BackendError::Failed {
                message: "CAP_BATTERY_STATUS cannot be written through headsetcontrol".to_owned()
            })
        );
    }

    #[test]
    fn refuses_a_value_outside_the_range_the_capability_accepts() {
        let backend = backend(WRITE);

        // Rust is the last gate before the hardware, so the bound is enforced
        // here and not only wherever the UI happens to clamp (PROJECT.md §11).
        for value in [-1, 129] {
            assert_eq!(
                backend.set_param(MAXWELL, "CAP_SIDETONE", ParamValue::Int(value)),
                Err(BackendError::Failed {
                    message: format!("{value} is outside the 0..=128 that CAP_SIDETONE accepts"),
                })
            );
        }

        // A toggle is a range like any other: 2 is not "on".
        assert!(
            backend
                .set_param(MAXWELL, "CAP_VOICE_PROMPTS", ParamValue::Int(2))
                .is_err()
        );
    }

    #[test]
    fn nothing_is_spawned_for_a_value_it_refuses() {
        let backend = backend(WRITE);

        let _ = backend.set_param(MAXWELL, "CAP_SIDETONE", ParamValue::Int(9_999));

        assert!(backend.runner.last_call().is_empty());
    }

    #[test]
    fn accepts_both_ends_of_the_range() {
        let backend = backend(WRITE);

        for value in [0, 128] {
            let _ = backend.set_param(MAXWELL, "CAP_SIDETONE", ParamValue::Int(value));

            assert_eq!(backend.runner.last_call()[3], value.to_string());
        }
    }

    #[test]
    fn refuses_a_device_id_it_cannot_turn_into_a_cli_argument() {
        let backend = backend(HEALTHY);
        let malformed = BackendError::Failed {
            message: "malformed device id: nonsense".to_owned(),
        };

        assert_eq!(backend.device_state("nonsense"), Err(malformed.clone()));
        assert_eq!(
            backend.set_param("nonsense", "CAP_SIDETONE", ParamValue::Int(1)),
            Err(malformed)
        );
        assert!(backend.device_state("zz:4b28").is_err());
        assert!(backend.device_state("3329:zz").is_err());
    }

    // ── detection ───────────────────────────────────────────────────────────

    #[test]
    fn detects_a_binary_that_cannot_be_run_as_a_missing_one() {
        let backend = with_access(
            FakeRunner::failing("No such file or directory"),
            detect::Access::Granted,
        );

        assert_eq!(backend.detect(), Detection::MissingBinary);
    }

    #[test]
    fn accepts_the_recorded_output_of_the_minimum_release() {
        // Real output from a real headset, as this release reports it.
        assert_eq!(backend(HEALTHY).detect(), Detection::Ready);
    }

    #[test]
    fn detects_a_released_binary_that_is_too_old() {
        let backend = backend(HEALTHY);
        backend.runner.report_version(&version_line("3.1.0"));

        assert_eq!(
            backend.detect(),
            Detection::BadVersion {
                found: Some("3.1.0".to_owned()),
                required: detect::required_version(),
            }
        );
    }

    #[test]
    fn reads_the_version_the_way_a_release_prints_it() {
        assert_eq!(parse_version(VERSION_RELEASE), Some(RECORDED_VERSION));
    }

    #[test]
    fn refuses_a_release_that_sends_the_balance_packet() {
        let backend = backend(HEALTHY);
        backend.runner.report_version(&version_line(UNSAFE_VERSION));

        assert_eq!(
            backend.detect(),
            Detection::BadVersion {
                found: Some(UNSAFE_VERSION.to_owned()),
                required: detect::required_version(),
            }
        );
    }

    #[test]
    fn asks_for_the_version_before_anything_that_reads_a_device() {
        // `--version` returns after enumerating USB ids; a json call reads
        // status, which is what sends the packet on an unsafe binary.
        let backend = backend(HEALTHY);

        backend.detect();

        assert_eq!(
            backend.runner.calls(),
            vec![
                vec!["--version".to_owned()],
                vec!["--output=json".to_owned()]
            ]
        );
    }

    #[test]
    fn detects_a_binary_gone_between_its_two_calls_as_a_missing_one() {
        // An uninstall racing the probe.
        let backend = backend(HEALTHY);
        *backend.runner.vanishing.lock().unwrap() = Some("No such file or directory".to_owned());

        assert_eq!(backend.detect(), Detection::MissingBinary);
    }

    #[test]
    fn makes_no_json_call_to_a_binary_it_refuses() {
        let backend = backend(HEALTHY);
        backend.runner.report_version(&version_line(UNSAFE_VERSION));

        backend.detect();

        assert_eq!(backend.runner.calls(), vec![vec!["--version".to_owned()]]);
    }

    #[test]
    fn detects_output_it_cannot_read_as_an_incompatible_binary() {
        // What an older CLI does with an option it never heard of: a complaint
        // on stderr and nothing on stdout — here for `--version` itself.
        let unusable = with_access(
            FakeRunner::complaining("Usage: headsetcontrol [options]"),
            detect::Access::Granted,
        );
        unusable.runner.report_version("");

        let incompatible = Detection::BadVersion {
            found: None,
            required: detect::required_version(),
        };

        assert_eq!(unusable.detect(), incompatible);
        assert_eq!(unusable.runner.calls().len(), 1);
        // A safe version whose json this build cannot read is incompatible too.
        assert_eq!(backend(MALFORMED).detect(), incompatible);
    }

    #[test]
    fn detects_a_version_line_it_does_not_recognise_as_an_incompatible_binary() {
        let backend = backend(HEALTHY);
        backend
            .runner
            .report_version("headsetcontrol, some version\n");

        assert_eq!(
            backend.detect(),
            Detection::BadVersion {
                found: None,
                required: detect::required_version(),
            }
        );
    }

    // ── the interlock ───────────────────────────────────────────────────────

    #[test]
    fn reaches_no_device_before_a_detection_vouched_for_the_binary() {
        // The Rust hotplug loop lists devices on its own, before the frontend
        // has asked anything; it must not be what reads an unsafe binary's
        // status.
        let backend = with_access(FakeRunner::replaying(HEALTHY), detect::Access::Granted);
        let refused = BackendError::Failed {
            message: "headsetcontrol has not passed the version check".to_owned(),
        };

        assert_eq!(backend.list_devices().unwrap_err(), refused);
        assert_eq!(backend.device_state(MAXWELL).unwrap_err(), refused);
        assert_eq!(
            backend
                .set_param(MAXWELL, "CAP_SIDETONE", ParamValue::Int(1))
                .unwrap_err(),
            refused
        );
        assert!(backend.runner.calls().is_empty());
    }

    #[test]
    fn reaches_devices_once_a_detection_vouched_for_the_binary() {
        let backend = with_access(FakeRunner::replaying(HEALTHY), detect::Access::Granted);

        assert_eq!(backend.detect(), Detection::Ready);
        assert!(backend.list_devices().is_ok());
    }

    #[test]
    fn stops_reaching_devices_once_a_detection_refuses_the_binary() {
        // Swapped for an older one mid-session, then re-checked by a retry.
        let backend = with_access(FakeRunner::replaying(HEALTHY), detect::Access::Granted);
        backend.detect();

        backend.runner.report_version(&version_line(UNSAFE_VERSION));
        backend.detect();

        assert!(backend.list_devices().is_err());
    }

    #[test]
    fn stops_reaching_devices_once_the_binary_is_gone() {
        let backend = with_access(FakeRunner::replaying(HEALTHY), detect::Access::Granted);
        backend.detect();

        backend.runner.fail_with("No such file or directory");
        assert_eq!(backend.detect(), Detection::MissingBinary);
        // Back on PATH, but not yet re-checked.
        backend.runner.reinstall();

        assert!(backend.list_devices().is_err());
    }

    #[test]
    fn detects_a_device_that_refuses_to_open_as_a_permissions_problem() {
        let denied = with_access(FakeRunner::replaying(HEALTHY), detect::Access::Denied);

        assert_eq!(denied.detect(), Detection::NoPermissions);
    }

    #[test]
    fn detection_ignores_a_device_whose_usb_ids_make_no_sense() {
        // The listing still fails on it — detection just has nothing to check.
        let json = HEALTHY.replace("\"0x3329\"", "\"not-hex\"");
        let denied = with_access(FakeRunner::replaying(&json), detect::Access::Denied);

        assert_eq!(denied.detect(), Detection::Ready);
        assert!(denied.list_devices().is_err());
    }

    #[test]
    fn detects_a_working_binary_with_nothing_connected() {
        let denied = with_access(FakeRunner::replaying(EMPTY), detect::Access::Denied);

        assert_eq!(denied.detect(), Detection::Ready);
    }

    #[test]
    fn reports_a_binary_it_could_not_run() {
        // Vouched for, then gone — an uninstall while the app is open.
        let backend = backend(HEALTHY);
        backend.runner.fail_with("No such file or directory");
        let expected = BackendError::Failed {
            message: "could not run headsetcontrol: No such file or directory".to_owned(),
        };

        // Every operation reports it, not just the first call the app makes.
        assert_eq!(backend.list_devices().unwrap_err(), expected);
        assert_eq!(backend.device_state(MAXWELL).unwrap_err(), expected);
        assert_eq!(
            backend
                .set_param(MAXWELL, "CAP_SIDETONE", ParamValue::Int(1))
                .unwrap_err(),
            expected
        );
    }

    #[test]
    fn reports_the_complaint_the_cli_printed_instead_of_output() {
        let backend = with_access(
            FakeRunner::complaining("Error: device: format: vid:pid"),
            detect::Access::Granted,
        );
        backend.vouched.store(true, Ordering::SeqCst);

        assert_eq!(
            backend.list_devices().unwrap_err(),
            BackendError::Failed {
                message: "Error: device: format: vid:pid".to_owned()
            }
        );
    }

    #[test]
    fn reports_silence_from_the_cli_as_a_failure() {
        assert_eq!(
            backend("   ").list_devices().unwrap_err(),
            BackendError::Failed {
                message: "headsetcontrol produced no output".to_owned()
            }
        );
    }
}
