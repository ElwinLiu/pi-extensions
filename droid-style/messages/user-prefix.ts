import { UserMessageComponent } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

import { fgHex, stripAnsi } from "../ansi.js";

const USER_PREFIX = "›";
const USER_PREFIX_COLOR = "#908a76";

let activeTheme: any = null;
let isPatched = false;

function buildPrefixSegment(): string {
	const prefix = activeTheme ? fgHex(activeTheme, USER_PREFIX_COLOR, USER_PREFIX) : USER_PREFIX;
	if (typeof activeTheme?.bg === "function") {
		return activeTheme.bg("userMessageBg", `${prefix} `);
	}
	return `${prefix} `;
}

function readAnsiToken(text: string, index: number): string | undefined {
	if (text[index] !== "\x1b") return undefined;
	const tail = text.slice(index);
	// CSI sequences: \x1b[...m (colors, cursor, etc.)
	const csi = tail.match(/^\x1b\[[0-9;?]*[ -/]*[@-~]/)?.[0];
	if (csi) return csi;
	// OSC sequences: \x1b]...\x07 (hyperlinks, window title, etc.)
	const osc = tail.match(/^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/)?.[0];
	return osc;
}

function dropLeadingColumns(line: string, columns: number): string {
	if (columns <= 0 || line.length === 0) return line;

	let i = 0;
	let dropped = 0;
	let leadingAnsi = "";

	while (i < line.length && dropped < columns) {
		const ansi = readAnsiToken(line, i);
		if (ansi) {
			leadingAnsi += ansi;
			i += ansi.length;
			continue;
		}

		const codePoint = line.codePointAt(i);
		if (codePoint === undefined) break;
		const charLen = codePoint > 0xffff ? 2 : 1;
		const char = line.slice(i, i + charLen);
		i += charLen;
		dropped += Math.max(1, visibleWidth(char));
	}

	return `${leadingAnsi}${line.slice(i)}`;
}

export function installUserMessagePrefix(theme: any): void {
	activeTheme = theme;
	if (isPatched) return;
	isPatched = true;

	const baseRender = UserMessageComponent.prototype.render;

	UserMessageComponent.prototype.render = function patchedUserMessageRender(width: number): string[] {
		const lines = baseRender.call(this, width);
		if (lines.length === 0 || width <= 0) return lines;

		const output = [...lines];
		const startIndex = lines.length > 1 ? 1 : 0; // preserve leading spacer line

		let targetIndex = -1;
		for (let i = startIndex; i < output.length; i++) {
			const clean = stripAnsi(output[i] ?? "");
			if (clean.trim().length > 0) {
				targetIndex = i;
				break;
			}
		}
		if (targetIndex === -1) targetIndex = startIndex;

		const prefixSegment = buildPrefixSegment();
		const line = output[targetIndex] ?? "";
		const remainder = dropLeadingColumns(line, 1); // drop the 1-column padding, keep content
		output[targetIndex] = `${prefixSegment}${remainder}`;

		return output.map((renderedLine) =>
			visibleWidth(renderedLine) > width ? truncateToWidth(renderedLine, width, "") : renderedLine,
		);
	};
}
