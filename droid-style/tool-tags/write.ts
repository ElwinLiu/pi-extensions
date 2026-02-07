import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createWriteTool, getLanguageFromPath, highlightCode } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { stripAnsi } from "../ansi.js";
import { badge, getTextOutput, parens, replaceTabs, shortenPath } from "./common.js";

export function registerWriteTool(pi: ExtensionAPI): void {
	const baseWrite = createWriteTool(process.cwd());
	pi.registerTool({
		name: baseWrite.name,
		label: baseWrite.label,
		description: baseWrite.description,
		parameters: baseWrite.parameters,
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const tool = createWriteTool(ctx.cwd);
			return tool.execute(toolCallId, params as any, signal);
		},
		renderCall(args: any, theme: any) {
			const rawPath = String(args?.path ?? args?.file_path ?? "");
			const path = shortenPath(rawPath);
			const detail = path || "(unknown)";
			const language = rawPath ? getLanguageFromPath(rawPath) : undefined;

			let text = `${badge(theme, "WRITE FILE")} ${parens(theme, detail)}`;

			const content = String(args?.content ?? "");
			if (content) {
				const normalized = replaceTabs(content.replace(/\r/g, ""));
				const lines = language ? highlightCode(normalized, language) : normalized.split("\n");
				const shown = lines.slice(0, 10);
				const remaining = Math.max(0, lines.length - shown.length);
				text +=
					"\n\n" +
					shown.map((line) => (language ? line : theme.fg("toolOutput", line))).join("\n") +
					(remaining > 0 ? theme.fg("muted", `\n... (${remaining} more lines)`) : "");
			}

			return new Text(text, 0, 0);
		},
		renderResult(result, _options, theme: any) {
			const output = getTextOutput(result);
			if (!output) return new Text("", 0, 0);
			const color = result.isError ? "error" : "toolOutput";
			return new Text(`\n${theme.fg(color, stripAnsi(output).trim())}`, 0, 0);
		},
	});
}
