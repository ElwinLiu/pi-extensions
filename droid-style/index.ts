import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";

// Store the full theme reference
let fullTheme: any = null;

// Strip ANSI escape codes
function stripAnsi(str: string): string {
	return str
		.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
		.replace(/\x1b\]8;;[^\x07]*\x07/g, "")
		.replace(/\x1b_[^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
}

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
	render(width: number): string[] {
		const innerWidth = Math.max(1, width - 2);
		const border = fullTheme ? (text: string) => fullTheme.fg("borderMuted", text) : (text: string) => text;
		const prompt = fullTheme ? fullTheme.fg("accent", ">") : ">";
		const promptPrefix = ` ${prompt} `;
		const prefixWidth = visibleWidth(promptPrefix);
		const contentWidth = Math.max(1, innerWidth - prefixWidth);

		const parentLines = super.render(contentWidth);
		if (parentLines.length === 0) return parentLines;

		const bottomBorderIndex = findLastBorderIndex(parentLines);
		const rawContentLines = parentLines.slice(1, bottomBorderIndex);
		const autocompleteLines = parentLines.slice(bottomBorderIndex + 1);

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
	pi.on("session_start", (_event, ctx) => {
		// Store reference to full theme
		fullTheme = ctx.ui.theme;

		ctx.ui.setEditorComponent((tui, theme, kb) => new BoxEditor(tui, theme, kb));
	});
}
