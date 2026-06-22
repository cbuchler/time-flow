# GNOME Platform Design

Follow GNOME/libadwaita conventions within Tauri/WebView constraints.

## Shell

- Entry point uses AppIndicator/KStatusNotifier-compatible behavior.
- GNOME tray behavior may depend on extensions; document runtime limitations.
- Popover opens near the indicator and hides on blur where the environment supports it.

## UI

- Use Adwaita-style spacing, flat surfaces, and compact controls.
- Typography prefers Cantarell where installed, otherwise local bundled fallback/system sans.
- Avoid excessive translucency; GNOME variant should read as opaque and utilitarian.

## Behavior

- Clamp to visible work area.
- Respect system appearance when available.
- Notifications should integrate with the desktop notification service and quiet modes where supported.
