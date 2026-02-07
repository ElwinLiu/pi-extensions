import type { ExtensionAPI, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import { createReadTool, getLanguageFromPath, highlightCode, keyHint } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { stripAnsi } from "../ansi.js";
import { badge, getTextOutput, parens, replaceTabs, renderLines, shortenPath } from "./common.js";

export function registerReadTool(pi: ExtensionAPI): void {
	const baseRead = createReadTool(process.cwd());
	pi.registerTool({
		name: baseRead.name,
		label: baseRead.label,
		description: baseRead.description,
		parameters: baseRead.parameters,
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const tool = createReadTool(ctx.cwd);
			const result = await tool.execute(toolCallId, params as any, signal);
			const rawPath = String((params as any)?.path ?? (params as any)?.file_path ?? "");
			return {
				...result,
				details: { ...(result.details ?? {}), __path: rawPath },
			};
		},
		renderCall(args: any, theme: any) {
			const rawPath = String(args?.path ?? args?.file_path ?? "");
			const path = shortenPath(rawPath);
			const offset = args?.offset;
			const limit = args?.limit;

			let range = "";
			if (offset !== undefined || limit !== undefined) {
				const start = offset ?? 1;
				const end = limit !== undefined ? start + limit - 1 : "";
				range = `:${start}${end ? `-${end}` : ""}`;
			}

			const detail = path ? `${path}${range}` : "(unknown)";
			return new Text(`${badge(theme, "READ FILE")} ${parens(theme, detail)}`, 0, 0);
		},
		renderResult(result: any, options: ToolRenderResultOptions, theme: any) {
			const output = getTextOutput(result);

			if (result.isError) {
				const body = renderLines(theme, stripAnsi(output), options, { maxLines: 10, color: "error" });
				return new Text(`\n${body}`, 0, 0);
			}

			const rawPath = String(result.details?.__path ?? "");
			const language = rawPath ? getLanguageFromPath(rawPath) : undefined;

			const clean = replaceTabs(stripAnsi(output));
			const highlighted = language ? highlightCode(clean, language) : clean.split("\n");
			const lines = highlighted.length === 1 && highlighted[0] === "" ? [] : highlighted;

			if (lines.length === 0) {
				return new Text(`\n${theme.fg("dim", "(no output)")}`, 0, 0);
			}

			const maxLines = options.expanded ? lines.length : 10;
			const displayLines = lines.slice(0, maxLines);
			const remaining = lines.length - maxLines;

			let text = displayLines
				.map((line) => (language ? line : theme.fg("toolOutput", line)))
				.join("\n");

			if (remaining > 0) {
				text +=
					theme.fg("muted", `\n... (${remaining} more lines, `) +
					keyHint("expandTools", "to expand") +
					theme.fg("muted", ")");
			}

			return new Text(text ? `\n${text}` : "", 0, 0);
		},
	});
}
