# Shared Components

Use one shared React Native Web component system with platform tokens and small behavior branches. Do not fork four separate UIs.

## Primitives

- App shell/popover container.
- Navigation header with platform-specific title/back alignment.
- Footer toolbar.
- Project picker with inline task creation support.
- Timer card.
- Pomodoro ring/card.
- Today grouped entries.
- Week strip.
- Form row, text field, number stepper, toggle, segmented control, color swatch.
- Empty, loading, warning, and error states.

## Token Requirements

Tokens must cover material, card, input, separators, foreground text levels, accent, danger, focus ring, radius, type, shadow, sizing, and motion. Platform files define actual values.

## Divergence Policy

Allowed:

- Color, typography, radius, material, title alignment, control metrics, hover/focus styling, menu/tray placement.

Not allowed without updating root `DESIGN.md`:

- Different information architecture.
- Different data model.
- Different entry editing rules.
- Different empty-state behavior.

## React Native Web Rules

- Prefer `View`, `Text`, `Pressable`, `TextInput`, and list primitives.
- Add accessibility props at primitive level.
- Avoid direct DOM access unless required for WebView integration.
- Use layout-aware hooks for popover width/height and text fitting.
- Respect reduced motion.
