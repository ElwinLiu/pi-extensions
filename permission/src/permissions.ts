import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { PERMISSION_LEVEL_FLAG } from "./constants.js";
import { AiAssessor } from "./ai-assessment.js";
import { PermissionLevelStore } from "./level-store.js";
import { authorize, classifyToolCall } from "./tool-assessment.js";
import { SELECTOR_DESCRIPTIONS, setPermissionBadgeRenderer } from "./ui.js";
import { isImpactLevel, LEVELS } from "./types.js";
import type { ImpactLevel } from "./types.js";

const UI_BADGE_RENDER_EVENT = "ui:badge:render" as const;

// Load config from parent directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultConfigPath = join(__dirname, "..", "config.default.json");
const userConfigPath = join(__dirname, "..", "config.json");

interface Config {
	shortcut: string;
	description: string;
}

const DEFAULT_CONFIG: Config = {
	shortcut: "shift+tab",
	description: "Cycle through permission levels",
};

function loadConfig(): Config {
	// Start with hardcoded fallback defaults
	let config: Config = { ...DEFAULT_CONFIG };

	// Merge defaults from config.default.json
	try {
		const defaultsContent = readFileSync(defaultConfigPath, "utf-8");
		const defaults = JSON.parse(defaultsContent) as Partial<Config>;
		config = { ...config, ...defaults };
	} catch {
		// Use hardcoded defaults if file doesn't exist or is invalid
	}

	// Merge user overrides from config.json
	try {
		const userContent = readFileSync(userConfigPath, "utf-8");
		const userOverrides = JSON.parse(userContent) as Partial<Config>;
		config = { ...config, ...userOverrides };
	} catch {
		// No user config or invalid - use defaults
	}

	return config;
}

async function promptForPermissionLevel(ctx: ExtensionContext): Promise<ImpactLevel | undefined> {
	if (!ctx.hasUI) {
		ctx.ui.notify("Permission selector requires UI. Use /permission <low|medium|high> instead.", "error");
		return undefined;
	}

	const descriptions = LEVELS.map((lvl) => SELECTOR_DESCRIPTIONS[lvl]);
	const choice = await ctx.ui.select("Select permission level:", descriptions);
	if (!choice) return undefined;

	return LEVELS.find((lvl) => SELECTOR_DESCRIPTIONS[lvl] === choice);
}

export function registerPermissionSystem(pi: ExtensionAPI): void {
	const levelStore = new PermissionLevelStore(pi);
	const aiAssessor = new AiAssessor();
	const config = loadConfig();

	setPermissionBadgeRenderer((theme, label) => {
		let rendered: string | undefined;
		pi.events.emit(UI_BADGE_RENDER_EVENT, {
			label,
			theme,
			respond: (value: string) => {
				if (!rendered) rendered = value;
			},
		});
		return rendered;
	});

	pi.registerFlag(PERMISSION_LEVEL_FLAG, {
		description: "Max impact level auto-approved: low | medium | high",
		type: "string",
	});

	pi.registerCommand("permission", {
		description: "Show or set permission level: /permission [low|medium|high]",
		getArgumentCompletions: (prefix) => {
			const normalized = prefix.toLowerCase();
			const choices = LEVELS.filter((item) => item.startsWith(normalized));
			return choices.length ? choices.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			levelStore.setLatestContext(ctx);

			const value = args.trim().toLowerCase();
			if (!value) {
				const selected = await promptForPermissionLevel(ctx);
				if (selected) {
					levelStore.set(selected, ctx);
				}
				return;
			}

			if (!isImpactLevel(value)) {
				ctx.ui.notify("Usage: /permission [low|medium|high]", "error");
				return;
			}

			levelStore.set(value, ctx);
		},
	});

	pi.registerShortcut(config.shortcut, {
		description: config.description,
		handler: () => {
			levelStore.cycle();
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		levelStore.init(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		return {
			systemPrompt: `${event.systemPrompt}\n\nPermission policy active. Current level: ${levelStore.current.toUpperCase()}. Unknown bash/tool impacts are AI-classified from operation semantics and conversation intent.`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		levelStore.setLatestContext(ctx);
		const assessment = await classifyToolCall(event, ctx, aiAssessor);
		const decision = await authorize(assessment, levelStore.current, ctx);
		if (decision.allowed) return undefined;
		return { block: true, reason: decision.reason ?? "Blocked by permission policy" };
	});
}
