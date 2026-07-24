//! Hotplug: turning "the OS noticed something" into `devices-changed`.
//!
//! The frontend never polls for presence — it subscribes to one event and
//! re-lists when it fires (`src/core/backend.ts`). What decides *whether* that
//! event fires lives here, and it is pure: the loop, the change detection and
//! the choice of watcher are all tested with fakes.
//!
//! The two watchers that actually talk to the OS — the udev monitor and the
//! polling timer — sit behind [`DeviceWatcher`] in [`super::exec`], the module
//! the coverage gate excludes. That is what keeps this file portable and fully
//! gated while the Linux-specific code stays in one place (ADR 0011).

use std::time::Duration;

use super::{BackendError, Device};

/// The event the webview listens for. Its counterpart is `DEVICES_CHANGED` in
/// `src/core/backend.ts`; the payload is deliberately empty — the frontend
/// re-lists devices, so the event carries no state that could go stale.
pub const DEVICES_CHANGED: &str = "devices-changed";

/// How long the polling fallback waits between looks.
///
/// Each tick costs one `headsetcontrol` invocation, so this trades how quickly
/// an unplug is noticed against how often a process is spawned. It only applies
/// where there is no udev monitor to listen to: another platform, or a system
/// where opening the monitor failed.
pub const POLL_INTERVAL: Duration = Duration::from_secs(3);

/// Set to `polling` to run without the udev monitor. Exists so the fallback can
/// be exercised on a machine that *has* udev — the acceptance criterion of
/// issue #10, and the only honest way to test that path.
pub const WATCHER_ENV: &str = "HEADSET_DECK_WATCHER";

const POLLING: &str = "polling";

/// A source of hotplug signals: udev on Linux, a timer everywhere else.
///
/// Implementations block until they have something to report, so the loop that
/// drives them runs on its own thread.
pub trait DeviceWatcher: Send {
    /// Blocks until something happened that may have changed the set of
    /// connected devices. It is a hint only — whether anything really changed
    /// is decided by [`watch`].
    ///
    /// `false` means the watcher's source is gone and no signal will ever
    /// follow, which ends the loop.
    fn wait_for_change(&mut self) -> bool;
}

/// Where a confirmed change is announced. The real implementation emits
/// [`DEVICES_CHANGED`] to the webview; tests count the calls.
pub trait ChangeSink: Send {
    fn devices_changed(&self);
}

/// Picks the watcher to run.
///
/// The polling fallback is not only an error path: it is what Windows and macOS
/// use until they get a native watcher (PROJECT.md §7), which is why the choice
/// lives here rather than inside the Linux code.
pub fn choose<U, P>(
    forced_polling: bool,
    native: impl FnOnce() -> Option<U>,
    polling: impl FnOnce() -> P,
) -> Box<dyn DeviceWatcher>
where
    U: DeviceWatcher + 'static,
    P: DeviceWatcher + 'static,
{
    if forced_polling {
        log::info!("{WATCHER_ENV}={POLLING}: watching devices by polling");
        return Box::new(polling());
    }

    match native() {
        Some(watcher) => Box::new(watcher),
        None => {
            log::warn!("no native device watcher available, polling instead");
            Box::new(polling())
        }
    }
}

/// Whether the environment asks for the polling fallback.
pub fn forces_polling(setting: Option<&str>) -> bool {
    setting.is_some_and(|value| value.trim().eq_ignore_ascii_case(POLLING))
}

/// The loop: wait for a signal, look at what is connected, and announce it only
/// when the set really differs.
///
/// The filtering matters. Plugging one headset in produces a burst of udev
/// events, and the polling fallback signals on every tick, while the frontend
/// must only hear about real changes — each `devices-changed` costs it a full
/// re-list. Comparing listed devices is also what keeps this module free of
/// headset knowledge: there is no vendor table to maintain, the adapter's own
/// answer is the authority (PROJECT.md §3.1).
pub fn watch(
    mut watcher: Box<dyn DeviceWatcher>,
    list: impl Fn() -> Result<Vec<Device>, BackendError>,
    sink: impl ChangeSink,
) {
    let mut known = connected(&list);

    while watcher.wait_for_change() {
        // A read that failed says nothing about what is plugged in, so the last
        // known set stands and the next successful read is compared against it.
        let Some(seen) = connected(&list) else {
            continue;
        };

        if known.as_ref() != Some(&seen) {
            known = Some(seen);
            sink.devices_changed();
        }
    }

    log::warn!("device watcher ended, hotplug events stop here");
}

/// The connected devices reduced to what identifies the set: their ids, in a
/// stable order. Nothing else about a device can change while it stays plugged
/// in, and a changed id is a different device.
fn connected(list: &impl Fn() -> Result<Vec<Device>, BackendError>) -> Option<Vec<String>> {
    match list() {
        Ok(devices) => {
            let mut ids: Vec<String> = devices.into_iter().map(|device| device.id).collect();
            ids.sort();
            Some(ids)
        }
        Err(error) => {
            log::info!("could not list devices while watching: {error}");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    /// Signals the scripted number of times, then reports that it is finished.
    struct FakeWatcher {
        signals: usize,
    }

    impl FakeWatcher {
        fn noticing(count: usize) -> Box<dyn DeviceWatcher> {
            Box::new(Self { signals: count })
        }
    }

    impl DeviceWatcher for FakeWatcher {
        fn wait_for_change(&mut self) -> bool {
            let pending = self.signals > 0;
            self.signals = self.signals.saturating_sub(1);
            pending
        }
    }

    #[derive(Default)]
    struct FakeSink {
        announcements: AtomicUsize,
    }

    // The loop takes its sink by value; the tests keep the reference and read
    // the count through it afterwards.
    impl ChangeSink for &FakeSink {
        fn devices_changed(&self) {
            self.announcements.fetch_add(1, Ordering::Relaxed);
        }
    }

    fn device(id: &str) -> Device {
        Device {
            id: id.to_owned(),
            name: "Test Headset".into(),
            vendor: "Test".into(),
            product: "Headset".into(),
            vendor_id: 0x1234,
            product_id: 0x5678,
            capabilities: vec!["CAP_SIDETONE".into()],
        }
    }

    /// Answers with each scripted listing in turn, then repeats the last one.
    fn lister(
        readings: Vec<Result<Vec<Device>, BackendError>>,
    ) -> impl Fn() -> Result<Vec<Device>, BackendError> {
        let calls = Cell::new(0usize);
        move || {
            let index = calls.get().min(readings.len() - 1);
            calls.set(calls.get() + 1);
            readings[index].clone()
        }
    }

    fn announcements(
        watcher: Box<dyn DeviceWatcher>,
        readings: Vec<Result<Vec<Device>, BackendError>>,
    ) -> usize {
        let sink = FakeSink::default();
        watch(watcher, lister(readings), &sink);
        sink.announcements.load(Ordering::Relaxed)
    }

    #[test]
    fn announces_a_device_that_appeared() {
        let count = announcements(
            FakeWatcher::noticing(1),
            vec![Ok(vec![]), Ok(vec![device("1038:12aa")])],
        );

        assert_eq!(count, 1);
    }

    #[test]
    fn announces_a_device_that_disappeared() {
        let count = announcements(
            FakeWatcher::noticing(1),
            vec![Ok(vec![device("1038:12aa")]), Ok(vec![])],
        );

        assert_eq!(count, 1);
    }

    #[test]
    fn announces_a_device_swapped_for_another() {
        let count = announcements(
            FakeWatcher::noticing(1),
            vec![Ok(vec![device("1038:12aa")]), Ok(vec![device("3329:4b28")])],
        );

        assert_eq!(count, 1);
    }

    #[test]
    fn stays_quiet_when_the_same_devices_are_still_there() {
        // Three signals with nothing plugged or unplugged: a udev burst, or the
        // polling fallback ticking away.
        let count = announcements(
            FakeWatcher::noticing(3),
            vec![Ok(vec![device("3329:4b28")])],
        );

        assert_eq!(count, 0);
    }

    #[test]
    fn ignores_the_order_devices_are_listed_in() {
        let both = vec![device("3329:4b28"), device("1038:12aa")];
        let reversed = vec![device("1038:12aa"), device("3329:4b28")];

        let count = announcements(FakeWatcher::noticing(1), vec![Ok(both), Ok(reversed)]);

        assert_eq!(count, 0);
    }

    #[test]
    fn a_failed_reading_announces_nothing() {
        let count = announcements(
            FakeWatcher::noticing(1),
            vec![
                Ok(vec![device("3329:4b28")]),
                Err(BackendError::Failed {
                    message: "binary gone".into(),
                }),
            ],
        );

        assert_eq!(count, 0);
    }

    #[test]
    fn a_failed_reading_does_not_lose_what_is_known() {
        // Fail, then read the same devices as before: the headset never left,
        // so the failure must not turn into a spurious change.
        let count = announcements(
            FakeWatcher::noticing(2),
            vec![
                Ok(vec![device("3329:4b28")]),
                Err(BackendError::NotImplemented),
                Ok(vec![device("3329:4b28")]),
            ],
        );

        assert_eq!(count, 0);
    }

    #[test]
    fn announces_the_first_reading_that_succeeds() {
        // Nothing was known at startup, so the first list that works is news.
        let count = announcements(
            FakeWatcher::noticing(1),
            vec![
                Err(BackendError::NotImplemented),
                Ok(vec![device("3329:4b28")]),
            ],
        );

        assert_eq!(count, 1);
    }

    #[test]
    fn the_startup_listing_is_never_an_announcement() {
        let count = announcements(
            FakeWatcher::noticing(0),
            vec![Ok(vec![device("3329:4b28")])],
        );

        assert_eq!(count, 0);
    }

    #[test]
    fn stops_when_the_watcher_ends() {
        let count = announcements(
            FakeWatcher::noticing(1),
            vec![Ok(vec![]), Ok(vec![device("3329:4b28")]), Ok(vec![])],
        );

        // Only the reading the one signal asked for counts: the watcher is
        // finished after it, so the empty list behind it is never seen.
        assert_eq!(count, 1);
    }

    /// A watcher that is finished before it starts — enough to tell which one
    /// was chosen.
    struct Nothing;

    impl DeviceWatcher for Nothing {
        fn wait_for_change(&mut self) -> bool {
            false
        }
    }

    /// Counts which watchers [`choose`] tried to start.
    #[derive(Default)]
    struct Starts {
        native: Cell<usize>,
        polling: Cell<usize>,
    }

    impl Starts {
        fn native(&self, available: bool) -> impl FnOnce() -> Option<Nothing> {
            move || {
                self.native.set(self.native.get() + 1);
                available.then_some(Nothing)
            }
        }

        fn polling(&self) -> impl FnOnce() -> Nothing {
            move || {
                self.polling.set(self.polling.get() + 1);
                Nothing
            }
        }
    }

    #[test]
    fn prefers_the_native_watcher_when_there_is_one() {
        let starts = Starts::default();

        let mut watcher = choose(false, starts.native(true), starts.polling());

        assert_eq!(starts.polling.get(), 0);
        assert!(!watcher.wait_for_change());
    }

    #[test]
    fn falls_back_to_polling_when_there_is_no_native_watcher() {
        let starts = Starts::default();

        let _ = choose(false, starts.native(false), starts.polling());

        assert_eq!((starts.native.get(), starts.polling.get()), (1, 1));
    }

    #[test]
    fn forced_polling_never_starts_the_native_watcher() {
        let starts = Starts::default();

        let _ = choose(true, starts.native(true), starts.polling());

        assert_eq!((starts.native.get(), starts.polling.get()), (0, 1));
    }

    #[test]
    fn only_the_polling_setting_forces_polling() {
        assert!(forces_polling(Some("polling")));
        assert!(forces_polling(Some(" Polling\n")));
        assert!(!forces_polling(Some("udev")));
        assert!(!forces_polling(Some("")));
        assert!(!forces_polling(None));
    }
}
