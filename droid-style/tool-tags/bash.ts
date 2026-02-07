import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { stripAnsi } from "../ansi.js";
import { badge, getTextOutput, parens, renderLines } from "./common.js";

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
			return new Text(`${badge(theme, "RUN COMMAND")} ${parens(theme, command + timeoutSuffix)}`, 0, 0);
		},
		renderResult(result, options, theme: any) {
			const output = getTextOutput(result).trimEnd();
			const body = renderLines(theme, stripAnsi(output), options, {
				maxLines: 5,
				tail: true,
				color: result.isError ? "error" : "toolOutput",
			});
			return new Text(`\n${body}`, 0, 0);
		},
	});
}
