import type { ExtensionAPI, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";

import { stripAnsi } from "../ansi.js";
import { badge, getTextOutput, parens, replaceTabs } from "./common.js";

const MAX_BASH_PREVIEW_LINES = 5;
const BASH_TOOL_NOTICE_PATTERN = /^\[Showing (?:last|lines)\b.*\. Full output: .+\]$/;

function stripBashToolNoticeLines(text: string): string {
	const filteredLines = text
		.replace(/\r/g, "")
		.split("\n")
		.filter((line) => !BASH_TOOL_NOTICE_PATTERN.test(line.trim()));
	return filteredLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function createBashResultPreview(
	theme: any,
	text: string,
	options: ToolRenderResultOptions,
	color: "toolOutput" | "error",
): Component {
	return {
		invalidate() {},
		render(width: number): string[] {
			const renderWidth = Math.max(1, width);
			const normalized = replaceTabs(text);
			const logicalLines = normalized.split("\n");
			const hasOutput = !(logicalLines.length === 1 && logicalLines[0] === "");

			if (!hasOutput) {
				return [];
			}

			if (options.expanded) {
				const wrapped = wrapTextWithAnsi(normalized, renderWidth);
				const expandedLines = wrapped.length === 1 && wrapped[0] === "" ? [] : wrapped;
				return ["", ...expandedLines.map((line) => theme.fg(color, line))];
			}

			const shown = logicalLines.slice(-MAX_BASH_PREVIEW_LINES);
			const remaining = logicalLines.length - shown.length;
			const truncatedShown = shown.map((line) => theme.fg(color, truncateToWidth(line, renderWidth, "…")));

			if (remaining <= 0) {
				return ["", ...truncatedShown];
			}

			const hint = truncateToWidth(`... ${remaining} more lines, press Ctrl+o to expand`, renderWidth, "…");
			return ["", ...truncatedShown, "", theme.fg("muted", hint)];
		},
	};
}

export function registerBashTool(pi: ExtensionAPI): void {
	const baseBash = createBashTool(process.cwd());
	pi.registerTool({
		name: baseBash.name,
		label: baseBash.label,
		description: baseBash.description,
		parameters: baseBash.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const tool = createBashTool(ctx.cwd);
			return tool.execute(toolCallId, params as any, signal, onUpdate);
		},
		renderCall(args: any, theme: any) {
			const command = String(args?.command ?? "...");
			const timeout = args?.timeout;
			const timeoutSuffix = timeout ? ` (timeout ${timeout}s)` : "";
			const line = `${badge(theme, "RUN COMMAND")} ${parens(theme, command + timeoutSuffix)}`;
			return {
				invalidate() {},
				render(width: number): string[] {
					return [truncateToWidth(line, Math.max(1, width), "…")];
				},
			};
		},
		renderResult(result, options, theme: any) {
			const output = stripBashToolNoticeLines(stripAnsi(getTextOutput(result)));
			return createBashResultPreview(theme, output, options, result.isError ? "error" : "toolOutput");
		},
	});
}
