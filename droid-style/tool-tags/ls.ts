import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createLsTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { stripAnsi } from "../ansi.js";
import { badge, getTextOutput, parens, renderLines, shortenPath } from "./common.js";

export function registerLsTool(pi: ExtensionAPI): void {
	const baseLs = createLsTool(process.cwd());
	pi.registerTool({
		name: baseLs.name,
		label: baseLs.label,
		description: baseLs.description,
		parameters: baseLs.parameters,
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const tool = createLsTool(ctx.cwd);
			return tool.execute(toolCallId, params as any, signal);
		},
		renderCall(args: any, theme: any) {
			const rawPath = String(args?.path ?? ".");
			const displayPath = rawPath === "." || rawPath === "" ? "current directory" : shortenPath(rawPath);
			return new Text(`${badge(theme, "LIST DIRECTORY")} ${parens(theme, displayPath)}`, 0, 0);
		},
		renderResult(result, options, theme: any) {
			const output = getTextOutput(result);
			const body = renderLines(theme, stripAnsi(output), options, {
				maxLines: 20,
				color: result.isError ? "error" : "toolOutput",
			});
			return new Text(`\n${body}`, 0, 0);
		},
	});
}
