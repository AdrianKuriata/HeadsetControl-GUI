//! Headset access behind a single seam.
//!
//! [`HeadsetBackend`] is the dependency-inversion boundary: `headsetcontrol` is
//! the adapter over the external CLI (#8), and a future native HID backend plugs
//! in behind the same trait without frontend changes.
//!
//! The domain types here are the contract with the frontend — they are exported
//! to `src/core/types.gen.ts` by tauri-specta and never leak the CLI's own JSON
//! shape.

mod headsetcontrol;
mod hotplug;

use serde::{Deserialize, Serialize};
use specta::Type;

/// A headset (or its dongle) as the UI knows it.
///
/// `capabilities` are the raw `CAP_*` identifiers reported by the device. They
/// stay strings on purpose: a newer `headsetcontrol` may report a capability
/// this build has never heard of, and the frontend has to ignore it rather than
/// fail to read the device (forward compatibility, PROJECT.md §3.3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    /// Stable identity across hotplug events: `"{vendor_id:04x}:{product_id:04x}"`.
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub product: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum BatteryStatus {
    Available,
    Charging,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Battery {
    pub status: BatteryStatus,
    /// Percentage; only meaningful when the status is `Available`.
    pub level: Option<u8>,
}

/// Live values of a device. Every field is optional — a device reports only
/// what its capabilities cover.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
pub struct DeviceState {
    pub battery: Option<Battery>,
    pub chatmix: Option<u8>,
}

/// Value written to a device parameter. Parameters are addressed by their
/// capability identifier, so supporting a new one needs no change here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case", tag = "kind", content = "value")]
pub enum ParamValue {
    Int(i32),
    Bool(bool),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum BackendError {
    /// No backend implementation is wired up yet (until the adapter lands, #8).
    NotImplemented,
    /// The operation reached the device layer and failed there.
    Failed { message: String },
}

impl std::fmt::Display for BackendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotImplemented => write!(f, "backend not implemented"),
            Self::Failed { message } => write!(f, "backend failure: {message}"),
        }
    }
}

impl std::error::Error for BackendError {}

/// The seam. Implementations: the `headsetcontrol` adapter (#8), a native HID
/// backend later, and [`UnimplementedBackend`] until the first one exists.
pub trait HeadsetBackend: Send + Sync {
    fn list_devices(&self) -> Result<Vec<Device>, BackendError>;
    fn device_state(&self, device_id: &str) -> Result<DeviceState, BackendError>;
    fn set_param(
        &self,
        device_id: &str,
        param: &str,
        value: ParamValue,
    ) -> Result<(), BackendError>;
}

/// Placeholder registered while the real adapter is being built (#8). The
/// frontend develops against its own MockBackend, so every call here answers
/// with an honest "not implemented" instead of a silent empty result.
pub struct UnimplementedBackend;

impl HeadsetBackend for UnimplementedBackend {
    fn list_devices(&self) -> Result<Vec<Device>, BackendError> {
        Err(BackendError::NotImplemented)
    }

    fn device_state(&self, _device_id: &str) -> Result<DeviceState, BackendError> {
        Err(BackendError::NotImplemented)
    }

    fn set_param(
        &self,
        _device_id: &str,
        _param: &str,
        _value: ParamValue,
    ) -> Result<(), BackendError> {
        Err(BackendError::NotImplemented)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unimplemented_backend_answers_not_implemented_to_every_call() {
        let backend = UnimplementedBackend;

        assert_eq!(backend.list_devices(), Err(BackendError::NotImplemented));
        assert_eq!(
            backend.device_state("3329:4b28"),
            Err(BackendError::NotImplemented)
        );
        assert_eq!(
            backend.set_param("3329:4b28", "CAP_SIDETONE", ParamValue::Int(64)),
            Err(BackendError::NotImplemented)
        );
    }

    #[test]
    fn backend_errors_describe_themselves() {
        assert_eq!(
            BackendError::NotImplemented.to_string(),
            "backend not implemented"
        );
        assert_eq!(
            BackendError::Failed {
                message: "device gone".into()
            }
            .to_string(),
            "backend failure: device gone"
        );
    }

    #[test]
    fn device_state_defaults_to_no_values() {
        assert_eq!(
            DeviceState::default(),
            DeviceState {
                battery: None,
                chatmix: None
            }
        );
    }
}
