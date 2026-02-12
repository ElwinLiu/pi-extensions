import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { parseFrontmatter, stripFrontmatter } from "@mariozechner/pi-coding-agent";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

type Frontmatter = Record<string, unknown>;

type AgentCommand = {
	name: string;
	filePath: string;
	description: string;
};

function parseCommandArgs(argsString: string): string[] {
	const args: string[] = [];
	let current = "";
	let inQuote: string | null = null;

	for (let i = 0; i < argsString.length; i += 1) {
		const ch = argsString[i];
		if (!ch) continue;

		if (inQuote) {
			if (ch === inQuote) {
				inQuote = null;
			} else {
				current += ch;
			}
			continue;
		}

		if (ch === "\"" || ch === "'") {
			inQuote = ch;
			continue;
		}

		if (ch === " " || ch === "\t") {
			if (current) {
				args.push(current);
				current = "";
			}
			continue;
		}

		current += ch;
	}

	if (current) {
		args.push(current);
	}

	return args;
}

function substituteArgs(content: string, args: string[]): string {
	let result = content;

	// Replace $1, $2, ...
	result = result.replace(/\$(\d+)/g, (_m, num: string) => {
		const index = Number.parseInt(num, 10) - 1;
		return args[index] ?? "";
	});

	// Replace ${@:N} or ${@:N:L}
	result = result.replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_m, startStr: string, lengthStr?: string) => {
		let start = Number.parseInt(startStr, 10) - 1;
		if (start < 0) start = 0;
		if (lengthStr) {
			const length = Number.parseInt(lengthStr, 10);
			return args.slice(start, start + length).join(" ");
		}
		return args.slice(start).join(" ");
	});

	const allArgs = args.join(" ");
	result = result.replace(/\$ARGUMENTS/g, allArgs);
	result = result.replace(/\$@/g, allArgs);

	return result;
}

function describeCommandFromFile(filePath: string): string {
	try {
		const raw = readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter<Frontmatter>(raw);

		const fmDesc = frontmatter.description;
		let description = typeof fmDesc === "string" ? fmDesc.trim() : "";

		if (!description) {
			const firstLine = body.split("\n").find((l) => l.trim());
			if (firstLine) {
				description = firstLine.slice(0, 60);
				if (firstLine.length > 60) description += "...";
			}
		}

		return description ? `${description} (agents)` : "(agents)";
	} catch {
		return "(agents)";
	}
}

function listMarkdownFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];

	const files: string[] = [];
	let entries: Array<import("node:fs").Dirent>;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);

		let isFile = entry.isFile();
		if (entry.isSymbolicLink()) {
			try {
				isFile = statSync(fullPath).isFile();
			} catch {
				continue;
			}
		}

		if (!isFile) continue;
		if (!entry.name.endsWith(".md")) continue;
		files.push(fullPath);
	}

	return files;
}

function loadAgentCommands(commandsDir: string, prefix: string): AgentCommand[] {
	const files = listMarkdownFiles(commandsDir);

	const commands: AgentCommand[] = [];
	for (const filePath of files) {
		const baseName = basename(filePath).replace(/\.md$/, "").trim();
		if (!baseName) continue;

		commands.push({
			name: `${prefix}${baseName}`,
			filePath,
			description: describeCommandFromFile(filePath),
		});
	}

	return commands;
}

export default function (pi: ExtensionAPI) {
	const commandsDir = process.env.PI_AGENTS_COMMANDS_DIR ?? join(homedir(), ".agents", "commands");
	const prefix = ":"; // used as /:<name>

	const commands = loadAgentCommands(commandsDir, prefix);

	for (const cmd of commands) {
		pi.registerCommand(cmd.name, {
			description: cmd.description,
			handler: async (argsString, ctx) => {
				const raw = readFileSync(cmd.filePath, "utf-8");
				const body = stripFrontmatter(raw).trim();

				const args = parseCommandArgs(argsString);
				const expanded = substituteArgs(body, args);

				// If streaming, steer by default
				pi.sendUserMessage(expanded, ctx.isIdle() ? undefined : { deliverAs: "steer" });
			},
		});
	}

	// No UI/status output by default (keep footer clean)
}
