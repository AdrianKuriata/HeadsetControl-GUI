//! Headset access behind a single seam.
//!
//! [`HeadsetBackend`] is the dependency-inversion boundary: `headsetcontrol` is
//! the adapter over the external CLI (#8), and a future native HID backend plugs
//! in behind the same trait without frontend changes.
//!
//! The domain types here are the contract with the frontend — they are exported
//! to `src/core/types.gen.ts` by tauri-specta and never leak the CLI's own JSON
//! shape.

mod exec;
mod headsetcontrol;
mod hotplug;

pub use exec::ProcessRunner;
pub use headsetcontrol::HeadsetControlBackend;

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
    /// The backend does not implement this operation. Part of the wire contract
    /// (the frontend already renders it) for a backend that covers only part of
    /// the seam — the planned native HID one, for instance.
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

/// The seam. Implemented by [`HeadsetControlBackend`]; a native HID backend
/// plugs in behind it later with no frontend change.
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

#[cfg(test)]
mod tests {
    use super::*;

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
