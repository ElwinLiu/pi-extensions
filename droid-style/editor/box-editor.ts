import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, visibleWidth } from "@mariozechner/pi-tui";

import { fgHex, stripAnsi } from "../ansi.js";
import { runEditorShortcut } from "../editor-shortcuts.js";

const INPUT_BORDER_COLOR = "#c0c0c0";
const BASH_PROMPT_COLOR = "#05ff03";

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

function stripBashPrefix(line: string): string {
	if (line.startsWith("!!")) return line.slice(2);
	if (line.startsWith("!")) return line.slice(1);
	return line;
}

export class BoxEditor extends CustomEditor {
	constructor(
		tui: any,
		theme: any,
		kb: any,
		private readonly fullTheme: any,
	) {
		super(tui, theme, kb);
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.ctrl("l")) && runEditorShortcut("ctrl+l")) {
			return;
		}
		super.handleInput(data);
	}

	render(width: number): string[] {
		const innerWidth = Math.max(1, width - 2);
		const border = this.fullTheme
			? (text: string) => fgHex(this.fullTheme, INPUT_BORDER_COLOR, text)
			: this.borderColor;

		const text = this.getText();
		const isBashMode = text.startsWith("!");
		const isDoubleBang = text.startsWith("!!");

		const promptChar = isDoubleBang ? "!!" : isBashMode ? "!" : ">";
		const prompt = this.fullTheme
			? isBashMode
				? fgHex(this.fullTheme, BASH_PROMPT_COLOR, promptChar)
				: this.fullTheme.fg("accent", ">")
			: promptChar;
		const promptPrefix = ` ${prompt} `;
		const prefixWidth = visibleWidth(promptPrefix);
		const contentWidth = Math.max(1, innerWidth - prefixWidth);

		const parentLines = super.render(contentWidth);
		if (parentLines.length === 0) return parentLines;

		const bottomBorderIndex = findLastBorderIndex(parentLines);
		const rawContentLines =
			bottomBorderIndex > 0 ? parentLines.slice(1, bottomBorderIndex) : parentLines.slice(1);
		const autocompleteLines = bottomBorderIndex >= 0 ? parentLines.slice(bottomBorderIndex + 1) : [];

		const displayLines = rawContentLines.length > 0 ? [...rawContentLines] : [""];
		if (isBashMode && displayLines[0]) {
			displayLines[0] = stripBashPrefix(displayLines[0]);
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
