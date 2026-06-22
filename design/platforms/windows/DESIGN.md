# Windows Platform Design

Follow Windows 11 and Fluent-style conventions.

## Shell

- Entry point behaves like a system tray app.
- Popover opens near the tray icon and hides on blur.
- Use Mica/Acrylic-inspired tokens where available; fall back to solid Fluent surfaces.

## UI

- Typography uses Segoe UI/Segoe UI Variable where available.
- Navigation title can align left, matching NavigationView-style conventions.
- Controls use Windows-style radius, hover, focus, and command spacing.
- Settings are grouped into Windows-like cards/rows inside the popover.

## Behavior

- Clamp against taskbar and visible work area.
- Recompute placement on DPI, taskbar, and monitor changes.
- Respect Windows quiet modes for notifications.
