//! System-wide input-idle detection.
//!
//! Reports how long the machine has gone without any keyboard / mouse / HID
//! input — used to drive the menu-bar idle counter. macOS uses the CoreGraphics
//! event-source API (the same value Energy Saver and screensavers read); other
//! platforms report 0.0 (treated as "never idle") until implemented.

#[cfg(target_os = "macos")]
pub fn system_idle_seconds() -> f64 {
    // kCGEventSourceStateHIDSystemState = 1; kCGAnyInputEventType = (uint32_t)~0.
    const HID_SYSTEM_STATE: u32 = 1;
    const ANY_INPUT_EVENT: u32 = !0u32;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: u32, event_type: u32) -> f64;
    }

    // SAFETY: the call takes two plain integers and returns a double — no
    // pointers, allocations, or ownership cross the boundary.
    unsafe { CGEventSourceSecondsSinceLastEventType(HID_SYSTEM_STATE, ANY_INPUT_EVENT) }
}

#[cfg(not(target_os = "macos"))]
pub fn system_idle_seconds() -> f64 {
    0.0
}
