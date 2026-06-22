# KDE Platform Design

Follow KDE Plasma/Breeze conventions.

## Shell

- Entry point behaves like a Plasma tray applet.
- Popover opens near the tray icon and hides on blur.
- Use Breeze-like surface, border, and compact metrics.

## UI

- Typography prefers Noto Sans where installed, otherwise local bundled fallback/system sans.
- Controls use KDE/Breeze-like compact radius and clear focus outlines.
- Settings use form/group layouts inside the popover.

## Behavior

- Clamp against the panel and visible work area.
- Recompute placement on panel/monitor/DPI changes.
- Respect Plasma notification behavior and quiet modes where supported.
