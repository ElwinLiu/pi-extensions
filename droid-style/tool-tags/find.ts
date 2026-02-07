import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createFindTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { stripAnsi } from "../ansi.js";
import { badge, getTextOutput, parens, renderLines, shortenPath } from "./common.js";

export function registerFindTool(pi: ExtensionAPI): void {
	const baseFind = createFindTool(process.cwd());
	pi.registerTool({
		name: baseFind.name,
		label: baseFind.label,
		description: baseFind.description,
		parameters: baseFind.parameters,
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const tool = createFindTool(ctx.cwd);
			return tool.execute(toolCallId, params as any, signal);
		},
		renderCall(args: any, theme: any) {
			const pattern = String(args?.pattern ?? "");
			const rawPath = String(args?.path ?? ".");
			const displayPath = rawPath === "." || rawPath === "" ? "current directory" : shortenPath(rawPath);
			const detail = pattern ? `${pattern} in ${displayPath}` : displayPath;
			return new Text(`${badge(theme, "FIND FILES")} ${parens(theme, detail)}`, 0, 0);
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
