import type { ExtensionAPI, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import { createEditTool, renderDiff } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { relative, resolve } from "node:path";

import { stripAnsi } from "../ansi.js";
import { badge, getTextOutput, parens, renderLines } from "./common.js";

function resolveAbsolutePath(rawPath: string, cwd: string): string {
	const path = rawPath.trim();
	if (!path) return "";

	const home = process.env.HOME;
	if (home && (path === "~" || path.startsWith("~/"))) {
		return path === "~" ? home : resolve(home, path.slice(2));
	}

	return resolve(cwd, path);
}

function resolveRelativePath(rawPath: string, cwd: string): string {
	const absPath = resolveAbsolutePath(rawPath, cwd);
	if (!absPath) return "(unknown)";
	const relPath = relative(cwd, absPath).replace(/\\/g, "/");
	return relPath || ".";
}

function countDiffChanges(diff: string): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of diff.split("\n")) {
		if (/^\+\s*\d+\s/.test(line)) added++;
		else if (/^-\s*\d+\s/.test(line)) removed++;
	}
	return { added, removed };
}

export function registerEditTool(pi: ExtensionAPI): void {
	const baseEdit = createEditTool(process.cwd());
	pi.registerTool({
		name: baseEdit.name,
		label: baseEdit.label,
		description: baseEdit.description,
		parameters: baseEdit.parameters,
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const tool = createEditTool(ctx.cwd);
			const rawPath = String((params as any)?.path ?? (params as any)?.file_path ?? "");
			const relPath = resolveRelativePath(rawPath, ctx.cwd);
			const result = await tool.execute(toolCallId, params as any, signal);
			return {
				...result,
				details: {
					...(result.details ?? {}),
					__path: relPath,
				},
			};
		},
		renderCall(args: any, theme: any) {
			const rawPath = String(args?.path ?? args?.file_path ?? "");
			const relPath = rawPath ? resolveRelativePath(rawPath, process.cwd()) : "";
			const detail = relPath || "(unknown)";
			return new Text(`${badge(theme, "EDIT FILE")} ${parens(theme, detail)}`, 0, 0);
		},
		renderResult(result: any, options: ToolRenderResultOptions, theme: any) {
			if (result.isError) {
				const output = getTextOutput(result);
				return new Text(`${theme.fg("error", stripAnsi(output).trim() || "Error")}`, 0, 0);
			}

			const diff = result.details?.diff as string | undefined;
			if (!diff) {
				const output = stripAnsi(getTextOutput(result)).trim();
				return new Text(output ? `${theme.fg("toolOutput", output)}` : "", 0, 0);
			}

			const { added, removed } = countDiffChanges(diff);
			const summary = `↳ Succeeded. File edited. (+${added} added, -${removed} removed)`;

			const renderedDiff = renderDiff(diff, { filePath: result.details?.__path });
			const diffText = options.expanded
				? renderedDiff
				: renderLines(theme, renderedDiff, options, { maxLines: 20, color: "toolOutput" });

			return new Text(`${theme.fg("dim", summary)}\n\n${diffText}`, 0, 0);
		},
	});
}
