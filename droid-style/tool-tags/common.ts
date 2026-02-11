import type { AgentToolResult, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import { homedir } from "node:os";

import { fgHex } from "../ansi.js";

const TAG_BG = "#feb17f";

export function shortenPath(path: string): string {
	const home = homedir();
	if (path.startsWith(home)) return `~${path.slice(home.length)}`;
	return path;
}

export function replaceTabs(text: string): string {
	return text.replace(/\t/g, "   ");
}

export function getTextOutput(result: AgentToolResult<any> | undefined): string {
	if (!result?.content) return "";
	const textBlocks = result.content.filter((contentBlock: any) => contentBlock.type === "text");
	return textBlocks.map((contentBlock: any) => String(contentBlock.text ?? "")).join("\n").replace(/\r/g, "");
}

export function stripTrailingNotice(text: string): string {
	const normalized = (text ?? "").replace(/\r/g, "").trimEnd();
	if (!normalized) return "";
	if (normalized.startsWith("[") && normalized.endsWith("]")) return "";
	const noticeStart = normalized.lastIndexOf("\n\n[");
	if (noticeStart >= 0 && normalized.endsWith("]")) {
		return normalized.slice(0, noticeStart).trimEnd();
	}
	return normalized;
}

export function countLines(text: string): number {
	const normalized = (text ?? "").replace(/\r/g, "").replace(/\n+$/g, "");
	if (!normalized) return 0;
	return normalized.split("\n").length;
}

export function badge(theme: any, label: string): string {
	return theme.inverse(fgHex(theme, TAG_BG, theme.bold(` ${label} `)));
}

export function parens(theme: any, text: string): string {
	return theme.fg("muted", "(") + theme.fg("toolOutput", text) + theme.fg("muted", ")");
}

export function renderLines(
	theme: any,
	text: string,
	options: ToolRenderResultOptions,
	cfg: { maxLines: number; tail?: boolean; color?: "toolOutput" | "error" } = { maxLines: 10 },
): string {
	const color = cfg.color ?? "toolOutput";
	const rawLines = (text ?? "").split("\n");
	const lines = rawLines.length === 1 && rawLines[0] === "" ? [] : rawLines;

	if (lines.length === 0) {
		return theme.fg("dim", "(no output)");
	}

	if (options.expanded || lines.length <= cfg.maxLines) {
		return lines.map((line) => theme.fg(color, line)).join("\n");
	}

	const shown = cfg.tail ? lines.slice(-cfg.maxLines) : lines.slice(0, cfg.maxLines);
	const remaining = lines.length - shown.length;

	let output = shown.map((line) => theme.fg(color, line)).join("\n");
	if (cfg.tail) {
		output += theme.fg("muted", `\n... ${remaining} more lines, press Ctrl+o to expand`);
	} else {
		output += theme.fg("muted", `\n... ${remaining} more lines, press Ctrl+O to expand`);
	}

	return output;
}
