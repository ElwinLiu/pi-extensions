import type { ExtensionAPI, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import { createEditTool, renderDiff } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { stripAnsi } from "../ansi.js";
import { badge, getTextOutput, parens, renderLines, shortenPath } from "./common.js";

export function registerEditTool(pi: ExtensionAPI): void {
	const baseEdit = createEditTool(process.cwd());
	pi.registerTool({
		name: baseEdit.name,
		label: baseEdit.label,
		description: baseEdit.description,
		parameters: baseEdit.parameters,
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const tool = createEditTool(ctx.cwd);
			return tool.execute(toolCallId, params as any, signal);
		},
		renderCall(args: any, theme: any) {
			const rawPath = String(args?.path ?? args?.file_path ?? "");
			const path = shortenPath(rawPath);
			const detail = path || "(unknown)";
			return new Text(`${badge(theme, "EDIT FILE")} ${parens(theme, detail)}`, 0, 0);
		},
		renderResult(result: any, options: ToolRenderResultOptions, theme: any) {
			if (result.isError) {
				const output = getTextOutput(result);
				return new Text(`\n${theme.fg("error", stripAnsi(output).trim() || "Error")}`, 0, 0);
			}

			const output = getTextOutput(result);
			const diff = result.details?.diff as string | undefined;

			let text = "";
			if (output) {
				text += theme.fg("toolOutput", stripAnsi(output).trim());
			}
			if (diff) {
				const renderedDiff = renderDiff(diff);
				const diffText = options.expanded
					? renderedDiff
					: renderLines(theme, renderedDiff, options, { maxLines: 60, color: "toolOutput" });
				text += (text ? "\n\n" : "") + diffText;
			}

			return new Text(text ? `\n${text}` : "", 0, 0);
		},
	});
}
