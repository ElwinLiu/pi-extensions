/**
 * Droid-Style Tool Call Tags
 *
 * Renders a small badge/tag (e.g. "LIST DIRECTORY") for built-in tool calls.
 *
 * The badge background is #feb17f (per droid-style).
 */

import type { AgentToolResult, ExtensionAPI, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
	getLanguageFromPath,
	highlightCode,
	keyHint,
	renderDiff,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { homedir } from "node:os";
import { fgHex, stripAnsi } from "./ansi.js";

const TAG_BG = "#feb17f";

function shortenPath(path: string): string {
	const home = homedir();
	if (path.startsWith(home)) return `~${path.slice(home.length)}`;
	return path;
}

function replaceTabs(text: string): string {
	return text.replace(/\t/g, "   ");
}

function getTextOutput(result: AgentToolResult<any> | undefined): string {
	if (!result?.content) return "";
	const textBlocks = result.content.filter((c: any) => c.type === "text");
	return textBlocks
		.map((c: any) => String(c.text ?? ""))
		.join("\n")
		.replace(/\r/g, "");
}

function badge(theme: any, label: string): string {
	// Use inverse so we don't disturb the surrounding tool-block background.
	// We set the *foreground* to TAG_BG, then inverse makes it the background.
	return theme.inverse(fgHex(theme, TAG_BG, theme.bold(` ${label} `)));
}

function parens(theme: any, text: string): string {
	return theme.fg("muted", "(") + theme.fg("toolOutput", text) + theme.fg("muted", ")");
}

function renderLines(
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

	if (options.expanded) {
		return lines.map((l) => theme.fg(color, l)).join("\n");
	}

	if (lines.length <= cfg.maxLines) {
		return lines.map((l) => theme.fg(color, l)).join("\n");
	}

	const shown = cfg.tail ? lines.slice(-cfg.maxLines) : lines.slice(0, cfg.maxLines);
	const remaining = lines.length - shown.length;

	let out = shown.map((l) => theme.fg(color, l)).join("\n");

	if (cfg.tail) {
		out =
			theme.fg("muted", `... (${remaining} earlier lines, `) +
			keyHint("expandTools", "to expand") +
			theme.fg("muted", ")\n") +
			out;
	} else {
		out +=
			theme.fg("muted", `\n... (${remaining} more lines, `) +
			keyHint("expandTools", "to expand") +
			theme.fg("muted", ")");
	}

	return out;
}

export function registerToolCallTags(pi: ExtensionAPI): void {
	// ---------------------------------------------------------------------
	// read
	// ---------------------------------------------------------------------
	const baseRead = createReadTool(process.cwd());
	pi.registerTool({
		name: baseRead.name,
		label: baseRead.label,
		description: baseRead.description,
		parameters: baseRead.parameters,
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const tool = createReadTool(ctx.cwd);
			const res = await tool.execute(toolCallId, params as any, signal);
			const rawPath = String((params as any)?.path ?? (params as any)?.file_path ?? "");
			return {
				...res,
				details: { ...(res.details ?? {}), __path: rawPath },
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
			const lang = rawPath ? getLanguageFromPath(rawPath) : undefined;

			const clean = replaceTabs(stripAnsi(output));
			const highlighted = lang ? highlightCode(clean, lang) : clean.split("\n");
			const lines = highlighted.length === 1 && highlighted[0] === "" ? [] : highlighted;

			if (lines.length === 0) {
				return new Text(`\n${theme.fg("dim", "(no output)")}`, 0, 0);
			}

			const maxLines = options.expanded ? lines.length : 10;
			const displayLines = lines.slice(0, maxLines);
			const remaining = lines.length - maxLines;

			let text = displayLines
				.map((line) => (lang ? line : theme.fg("toolOutput", line)))
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

	// ---------------------------------------------------------------------
	// write
	// ---------------------------------------------------------------------
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
			const lang = rawPath ? getLanguageFromPath(rawPath) : undefined;

			let text = `${badge(theme, "WRITE FILE")} ${parens(theme, detail)}`;

			const content = String(args?.content ?? "");
			if (content) {
				const normalized = replaceTabs(content.replace(/\r/g, ""));
				const lines = lang ? highlightCode(normalized, lang) : normalized.split("\n");
				const shown = lines.slice(0, 10);
				const remaining = Math.max(0, lines.length - shown.length);
				text +=
					"\n\n" +
					shown.map((l) => (lang ? l : theme.fg("toolOutput", l))).join("\n") +
					(remaining > 0 ? theme.fg("muted", `\n... (${remaining} more lines)`) : "");
			}

			return new Text(text, 0, 0);
		},
		renderResult(result, _options, theme: any) {
			// write() already returns a concise success/error message in content.
			const output = getTextOutput(result);
			if (!output) return new Text("", 0, 0);
			const color = result.isError ? "error" : "toolOutput";
			return new Text(`\n${theme.fg(color, stripAnsi(output).trim())}`, 0, 0);
		},
	});

	// ---------------------------------------------------------------------
	// edit
	// ---------------------------------------------------------------------
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
				const rendered = renderDiff(diff);
				const diffText = options.expanded
					? rendered
					: renderLines(theme, rendered, options, { maxLines: 60, color: "toolOutput" });
				text += (text ? "\n\n" : "") + diffText;
			}

			return new Text(text ? `\n${text}` : "", 0, 0);
		},
	});

	// ---------------------------------------------------------------------
	// ls
	// ---------------------------------------------------------------------
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

	// ---------------------------------------------------------------------
	// find
	// ---------------------------------------------------------------------
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

	// ---------------------------------------------------------------------
	// grep
	// ---------------------------------------------------------------------
	const baseGrep = createGrepTool(process.cwd());
	pi.registerTool({
		name: baseGrep.name,
		label: baseGrep.label,
		description: baseGrep.description,
		parameters: baseGrep.parameters,
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const tool = createGrepTool(ctx.cwd);
			return tool.execute(toolCallId, params as any, signal);
		},
		renderCall(args: any, theme: any) {
			const pattern = String(args?.pattern ?? "");
			const rawPath = String(args?.path ?? ".");
			const displayPath = rawPath === "." || rawPath === "" ? "current directory" : shortenPath(rawPath);
			const detail = pattern ? `/${pattern}/ in ${displayPath}` : displayPath;
			return new Text(`${badge(theme, "SEARCH")} ${parens(theme, detail)}`, 0, 0);
		},
		renderResult(result, options, theme: any) {
			const output = getTextOutput(result);
			const body = renderLines(theme, stripAnsi(output), options, {
				maxLines: 15,
				color: result.isError ? "error" : "toolOutput",
			});
			return new Text(`\n${body}`, 0, 0);
		},
	});

	// ---------------------------------------------------------------------
	// bash
	// ---------------------------------------------------------------------
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
