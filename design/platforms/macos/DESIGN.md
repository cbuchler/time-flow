# macOS Platform Design

Follow Apple Human Interface Guidelines for a Menu Bar Extra-style app.

## Shell

- Entry point behaves like a menu bar extra.
- Popover is transient, hides on blur, and appears near the menu-bar item.
- Use vibrancy/glass-like material where the WebView/window stack can support it; fall back to a native-looking translucent surface.

## UI

- Typography uses the system font stack.
- Titles are centered where appropriate.
- Back affordance is visible on pushed screens.
- Controls use macOS-like spacing, radius, and emphasis.
- Prefer compact grouped settings inside the popover.

## Behavior

- Clamp popover to visible screen.
- Recompute placement on display and menu-bar changes.
- Respect system appearance and accent where feasible.
