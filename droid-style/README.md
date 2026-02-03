# Droid Style Extension

Custom input box with a closed rectangular border and orange accent color.

## Features

- Closed rectangular box around the input (┌─┐│└─┘)
- Orange `>` prompt matching your screenshot
- Clean, minimal design

## Installation

1. The extension is already in `~/.pi/agent/extensions/droid-style/`
2. Restart Pi or reload extensions
3. Select the `amber-dark` theme in Pi settings (`/settings` → Theme)

## Files

- `index.ts` - Main extension with custom BoxEditor component
- `package.json` - Extension manifest

## How it works

This extension overrides Pi's default input editor with a custom `BoxEditor` class that:
- Draws a continuous box border using Unicode box-drawing characters
- Styles the `>` prompt with the theme's accent color (amber/orange)
- Maintains all default editor functionality (keybindings, etc.)
