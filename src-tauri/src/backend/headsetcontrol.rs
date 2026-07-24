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

use serde::Deserialize;

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

/// Capability → CLI flag. This is the complete write vocabulary of the adapter:
/// a capability missing from the table cannot be written, and asking for one is
/// an error rather than a silent no-op.
///
/// Capability knowledge, not model knowledge — every headset that reports
/// `CAP_SIDETONE` is written the same way (PROJECT.md §3.1).
const WRITE_FLAGS: &[(&str, &str)] = &[
    ("CAP_SIDETONE", "-s"),
    ("CAP_INACTIVE_TIME", "-i"),
    ("CAP_VOICE_PROMPTS", "-v"),
    ("CAP_NOISE_FILTER", "--noise-filter"),
    ("CAP_EQUALIZER_PRESET", "-p"),
    ("CAP_LIGHTS", "-l"),
    ("CAP_NOTIFICATION_SOUND", "-n"),
    ("CAP_ROTATE_TO_MUTE", "-r"),
    (
        "CAP_MICROPHONE_MUTE_LED_BRIGHTNESS",
        "--microphone-mute-led-brightness",
    ),
    ("CAP_MICROPHONE_VOLUME", "--microphone-volume"),
    ("CAP_VOLUME_LIMITER", "--volume-limiter"),
    ("CAP_BT_WHEN_POWERED_ON", "--bt-when-powered-on"),
    ("CAP_BT_CALL_VOLUME", "--bt-call-volume"),
];

/// The `headsetcontrol` implementation of the [`HeadsetBackend`] seam.
pub struct HeadsetControlBackend<R: CliRunner> {
    runner: R,
}

impl<R: CliRunner> HeadsetControlBackend<R> {
    pub fn new(runner: R) -> Self {
        Self { runner }
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

impl<R: CliRunner> HeadsetBackend for HeadsetControlBackend<R> {
    fn list_devices(&self) -> Result<Vec<Device>, BackendError> {
        parse_devices(&self.output(&[json_output()])?)
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

        parse_state(&self.output(&args)?, device_id)
    }

    fn set_param(
        &self,
        device_id: &str,
        param: &str,
        value: ParamValue,
    ) -> Result<(), BackendError> {
        let flag = WRITE_FLAGS
            .iter()
            .find(|(capability, _)| *capability == param)
            .map(|(_, flag)| *flag)
            .ok_or_else(|| BackendError::Failed {
                message: format!("{param} cannot be written through headsetcontrol"),
            })?;

        let args = vec![
            "-d".to_owned(),
            cli_device_arg(device_id)?,
            flag.to_owned(),
            match value {
                ParamValue::Int(number) => number.to_string(),
                ParamValue::Bool(true) => "1".to_owned(),
                ParamValue::Bool(false) => "0".to_owned(),
            },
            json_output(),
        ];

        parse_write(&self.output(&args)?, param)
    }
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
        // A partial read: the device is there but a value could not be taken
        // from it (typically missing udev permissions, which is #9's screen).
        // The value is reported as absent rather than invented.
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
    use super::*;

    const HEALTHY: &str = include_str!("../../../docs/fixtures/maxwell2-xbox-output-json.json");
    const PARTIAL: &str = include_str!("../../../docs/fixtures/maxwell2-xbox-partial-errors.json");
    const MULTI: &str = include_str!("../../../docs/fixtures/test-device-multi.json");
    const WRITE: &str = include_str!("../../../docs/fixtures/write-actions-mixed.json");
    const EMPTY: &str = include_str!("../../../docs/fixtures/no-devices.json");
    const UNKNOWN_CAP: &str = include_str!("../../../docs/fixtures/unknown-capability.json");
    const MALFORMED: &str = include_str!("../../../docs/fixtures/malformed-truncated.json");

    const MAXWELL: &str = "3329:4b28";

    /// Replays recorded output and records what the adapter asked for.
    struct FakeRunner {
        stdout: String,
        stderr: String,
        error: Option<String>,
        calls: std::sync::Mutex<Vec<Vec<String>>>,
    }

    impl FakeRunner {
        fn replaying(stdout: &str) -> Self {
            Self {
                stdout: stdout.to_owned(),
                stderr: String::new(),
                error: None,
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
            Self {
                error: Some(error.to_owned()),
                ..Self::replaying("")
            }
        }

        fn last_call(&self) -> Vec<String> {
            self.calls
                .lock()
                .unwrap()
                .last()
                .cloned()
                .unwrap_or_default()
        }
    }

    impl CliRunner for FakeRunner {
        fn run(&self, args: &[String]) -> Result<CliOutput, String> {
            self.calls.lock().unwrap().push(args.to_vec());

            match &self.error {
                Some(error) => Err(error.clone()),
                None => Ok(CliOutput {
                    stdout: self.stdout.clone(),
                    stderr: self.stderr.clone(),
                }),
            }
        }
    }

    fn backend(stdout: &str) -> HeadsetControlBackend<FakeRunner> {
        HeadsetControlBackend::new(FakeRunner::replaying(stdout))
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
                    level: Some(92),
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
                message: "Could not open device".to_owned()
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
            "\"error_message\": \"Could not open device\"",
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

    #[test]
    fn reports_a_binary_it_could_not_run() {
        let backend = HeadsetControlBackend::new(FakeRunner::failing("No such file or directory"));
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
        let backend =
            HeadsetControlBackend::new(FakeRunner::complaining("Error: device: format: vid:pid"));

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
