import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, visibleWidth } from "@mariozechner/pi-tui";

import { fgHex, stripAnsi } from "./ansi.js";
import { runEditorShortcut } from "./editor-shortcuts.js";
import { registerToolCallTags } from "./tool-call-tags.js";

// Store the full theme reference
let fullTheme: any = null;

// Light gray border for the input box
const INPUT_BORDER_COLOR = "#c0c0c0";

// Check if a line is a border-only line (just ─ characters)
function isBorderLine(line: string): boolean {
	const clean = stripAnsi(line).replace(/\s/g, "");
	return clean === "" || clean.replace(/─/g, "") === "";
}

function findLastBorderIndex(lines: string[]): number {
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		if (isBorderLine(lines[i] ?? "")) return i;
	}
	return Math.max(0, lines.length - 1);
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
		const prompt = fullTheme ? fullTheme.fg("accent", ">") : ">";
		const promptPrefix = ` ${prompt} `;
		const prefixWidth = visibleWidth(promptPrefix);
		const contentWidth = Math.max(1, innerWidth - prefixWidth);

		const parentLines = super.render(contentWidth);
		if (parentLines.length === 0) return parentLines;

		// Find the bottom border (last horizontal border line)
		// The parent render structure is:
		// - Line 0: top border
		// - Lines 1..n-1: content lines
		// - Line n: bottom border (if no autocomplete) OR border before autocomplete
		// - Lines n+1..end: autocomplete dropdown (if active)
		const bottomBorderIndex = findLastBorderIndex(parentLines);
		
		// Content lines are between first border and bottom border
		// (index 1 to bottomBorderIndex - 1)
		const rawContentLines = bottomBorderIndex > 0 
			? parentLines.slice(1, bottomBorderIndex) 
			: parentLines.slice(1);
		
		// Autocomplete lines come after the bottom border
		const autocompleteLines = bottomBorderIndex >= 0 && bottomBorderIndex < parentLines.length - 1
			? parentLines.slice(bottomBorderIndex + 1)
			: [];

		const contentLines = rawContentLines.length > 0 ? rawContentLines : [""];
		const boxedLines = contentLines.map((line, index) => {
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
	// Droid-style tool badges for built-in tool calls
	registerToolCallTags(pi);

	pi.on("session_start", (_event, ctx) => {
		// Store reference to full theme
		fullTheme = ctx.ui.theme;

		// Set the custom editor component
		ctx.ui.setEditorComponent((tui, theme, kb) => new BoxEditor(tui, theme, kb));

		// Re-register after a tick to ensure autocomplete provider is set
		// This is needed because pi 0.52.7+ initializes autocomplete AFTER session_start
		setTimeout(() => {
			ctx.ui.setEditorComponent((tui, theme, kb) => new BoxEditor(tui, theme, kb));
		}, 0);
	});
}
