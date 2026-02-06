# Droid Permissions Extension

Permission/risk-gate logic extracted from `droid-style`.

## What it does

- Registers low/medium/high risk policy for tool calls + bash
- Shows permission widget above the editor
- Uses droid-style `EXECUTE` badge prompt with only:
  - `Yes, allow`
  - `No, Cancel`
- Wires Ctrl+L permission cycling through droid-style editor bridge

## Dependency

Designed to run alongside `droid-style` so Ctrl+L can be intercepted by the boxed editor.
