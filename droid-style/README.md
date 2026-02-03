# Droid Style Extension

Custom input box with a closed rectangular border and orange accent color.

## Features

- Closed rectangular box around the input (┌─┐│└─┘)
- Orange `>` prompt matching your screenshot
- Clean, minimal design

## Theme Settings

This extension works with the `droid` theme which has:
- Transparent backgrounds for user messages and tool boxes
- Border colors defined but not rendered (see Limitations below)

## Installation

1. The extension is already in `~/.pi/agent/extensions/droid-style/`
2. Select the `droid` theme in Pi settings (`/settings` → Theme)
3. Reload extensions if needed

## Files

- `index.ts` - Main extension with custom BoxEditor component
- `package.json` - Extension manifest

## How it works

This extension overrides Pi's default input editor with a custom `BoxEditor` class that:
- Draws a continuous box border using Unicode box-drawing characters
- Styles the `>` prompt with the theme's accent color (amber/orange)
- Maintains all default editor functionality (keybindings, etc.)

## Limitations

**Chat message boxes**: The extension system does not provide hooks to customize how user messages or tool calling boxes are rendered. While the `droid` theme sets transparent backgrounds for these elements, adding visible borders around them would require changes to pi's core code (specifically `UserMessageComponent` and `ToolExecutionComponent`).

To achieve boxed user messages and tool calls, the core components would need to be modified to use a bordered container, or the extension API would need to expose message rendering hooks.
