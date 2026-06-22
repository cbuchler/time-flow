# Accessibility

Accessibility is part of each component contract, not a cleanup pass.

## Keyboard

- All actionable controls must be keyboard reachable.
- Navigation back, primary action, pause/resume, stop, skip, settings toggles, steppers, pickers, and row resume actions require clear focus states.
- Focus must move predictably when screens are pushed and popped.

## Screen Readers

- Icon-only buttons need labels and hints.
- Timer status changes should use polite announcements where supported.
- Stop/destructive actions must be announced as destructive.
- Pomodoro phase changes require notification text and in-app accessible status.

## Visual

- Text must not overlap or clip at supported popover sizes.
- Contrast must pass for normal and disabled states.
- Reduced motion disables slide transitions and pulsing animations.
- Focus rings must be visible on all platform themes.

## Acceptance

Every screen must define empty, loading, error, keyboard, and screen-reader behavior before it is considered complete.
