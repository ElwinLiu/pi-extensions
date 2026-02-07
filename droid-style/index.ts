import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, visibleWidth } from "@mariozechner/pi-tui";

import { fgHex, stripAnsi } from "./ansi.js";
import { runEditorShortcut } from "./editor-shortcuts.js";
import { registerToolCallTags } from "./tool-call-tags.js";

// Store the full theme reference
let fullTheme: any = null;

// Light gray border for the input box
const INPUT_BORDER_COLOR = "#c0c0c0";

// Bash mode prompt color (bright green)
const BASH_PROMPT_COLOR = "#05ff03";

// Check if a line is a border-only line (just ─ characters or empty)
function isBorderLine(line: string): boolean {
	const clean = stripAnsi(line).replace(/\s/g, "");
	return clean.replace(/─/g, "") === "";
}

function findLastBorderIndex(lines: string[]): number {
	for (let i = lines.length - 1; i >= 0; i--) {
		if (isBorderLine(lines[i] ?? "")) return i;
	}
	return -1;
}

class BoxEditor extends CustomEditor {
	handleInput(data: string): void {
		if (matchesKey(data, Key.ctrl("l")) && runEditorShortcut("ctrl+l")) {
			return;
		}
		super.handleInput(data);
	}

	render(width: number): string[] {
		const innerWidth = Math.max(1, width - 2);
		const border = fullTheme
			? (text: string) => fgHex(fullTheme, INPUT_BORDER_COLOR, text)
			: this.borderColor;

		// Check if in bash mode (text starts with '!' or '!!')
		const text = this.getText();
		const isBashMode = text.startsWith("!");
		const isDoubleBang = text.startsWith("!!");

		// Use '!' or '!!' in green for bash mode, '>' in accent color otherwise
		const promptChar = isDoubleBang ? "!!" : (isBashMode ? "!" : ">");
		const prompt = fullTheme 
			? (isBashMode ? fgHex(fullTheme, BASH_PROMPT_COLOR, promptChar) : fullTheme.fg("accent", ">"))
			: promptChar;
		const promptPrefix = ` ${prompt} `;
		const prefixWidth = visibleWidth(promptPrefix);
		const contentWidth = Math.max(1, innerWidth - prefixWidth);

		const parentLines = super.render(contentWidth);
		if (parentLines.length === 0) return parentLines;

		const bottomBorderIndex = findLastBorderIndex(parentLines);
		
		// Content lines are between top border (index 0) and bottom border
		const rawContentLines = bottomBorderIndex > 0 
			? parentLines.slice(1, bottomBorderIndex) 
			: parentLines.slice(1);
		
		// Autocomplete lines come after the bottom border
		const autocompleteLines = bottomBorderIndex >= 0 
			? parentLines.slice(bottomBorderIndex + 1)
			: [];

		// In bash mode, strip the leading '!' or '!!' from display (it's shown in the prompt)
		let displayLines = rawContentLines.length > 0 ? [...rawContentLines] : [""];
		if (isBashMode && displayLines[0]) {
			if (displayLines[0].startsWith("!!")) {
				displayLines[0] = displayLines[0].slice(2);
			} else if (displayLines[0].startsWith("!")) {
				displayLines[0] = displayLines[0].slice(1);
			}
		}

		const boxedLines = displayLines.map((line, index) => {
			const prefix = index === 0 ? promptPrefix : " ".repeat(prefixWidth);
			const lineWidth = visibleWidth(line);
			const padding = " ".repeat(Math.max(0, contentWidth - lineWidth));
			return `${border("│")}${prefix}${line}${padding}${border("│")}`;
		});

		const topBorder = border(`╭${"─".repeat(innerWidth)}╮`);
		const bottomBorder = border(`╰${"─".repeat(innerWidth)}╯`);

		const paddedAutocomplete = autocompleteLines.map((line) => {
			const padding = " ".repeat(Math.max(0, width - visibleWidth(line)));
			return `${line}${padding}`;
		});

		return [topBorder, ...boxedLines, bottomBorder, ...paddedAutocomplete];
	}
}

export default function (pi: ExtensionAPI) {
	registerToolCallTags(pi);

	pi.on("session_start", (_event, ctx) => {
		fullTheme = ctx.ui.theme;

		// Defer editor creation to ensure autocomplete provider is initialized
		// (pi 0.52.7+ initializes autocomplete after session_start)
		setTimeout(() => {
			ctx.ui.setEditorComponent((tui, theme, kb) => new BoxEditor(tui, theme, kb));
		}, 0);
	});
}
