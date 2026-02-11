import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { PERMISSION_LEVEL_FLAG } from "./constants.js";
import { AiAssessor } from "./ai-assessment.js";
import { PermissionLevelStore } from "./level-store.js";
import { authorize, classifyToolCall } from "./tool-assessment.js";
import { SELECTOR_DESCRIPTIONS, setPermissionBadgeRenderer } from "./ui.js";
import { isPermissionLevel, LEVELS } from "./types.js";
import type { PermissionLevel } from "./types.js";
import { loadConfig } from "./config-loader.js";

const PERMISSION_BADGE_RENDERER_SET_EVENT = "permission:ui:badge-renderer:set" as const;
const PERMISSION_BADGE_RENDERER_REQUEST_EVENT = "permission:ui:badge-renderer:request" as const;

type PermissionBadgeRendererPayload = {
	renderBadge: (theme: unknown, label: string) => string | undefined;
};

function isPermissionBadgeRendererPayload(value: unknown): value is PermissionBadgeRendererPayload {
	if (!value || typeof value !== "object") return false;
	const record = value as Partial<PermissionBadgeRendererPayload>;
	return typeof record.renderBadge === "function";
}

async function promptForPermissionLevel(ctx: ExtensionContext): Promise<PermissionLevel | undefined> {
	if (!ctx.hasUI) {
		ctx.ui.notify("Permission selector requires UI. Use /permission <low|medium|YOLO> instead.", "error");
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

	setPermissionBadgeRenderer(undefined);

	pi.events.on(PERMISSION_BADGE_RENDERER_SET_EVENT, (payload) => {
		if (!isPermissionBadgeRendererPayload(payload)) return;
		setPermissionBadgeRenderer((theme, label) => payload.renderBadge(theme, label));
	});

	// Ask UI extensions to (re)register renderers, regardless of load order.
	pi.events.emit(PERMISSION_BADGE_RENDERER_REQUEST_EVENT, {});

	pi.registerFlag(PERMISSION_LEVEL_FLAG, {
		description: "Permission level: low | medium | YOLO",
		type: "string",
	});

	pi.registerCommand("permission", {
		description: "Show or set permission level: /permission [low|medium|YOLO]",
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

			if (!isPermissionLevel(value)) {
				ctx.ui.notify("Usage: /permission [low|medium|YOLO]", "error");
				return;
			}

			levelStore.set(value, ctx);
		},
	});

	pi.registerShortcut(config.cycle_shorcut, {
		description: "Cycle through permission levels (low → medium → YOLO)",
		handler: () => {
			levelStore.cycle();
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		levelStore.init(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		return {
			systemPrompt: `${event.systemPrompt}\n\nPermission policy active. Current level: ${levelStore.current.toUpperCase()}. Unknown bash/tool impacts are AI-classified from operation semantics and conversation intent. YOLO level bypasses all checks.`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		levelStore.setLatestContext(ctx);

		// YOLO mode: bypass all classification and authorization
		if (levelStore.current === "YOLO") {
			return undefined;
		}

		const assessment = await classifyToolCall(event, ctx, aiAssessor);
		const decision = await authorize(assessment, levelStore.current, ctx);
		if (decision.allowed) return undefined;
		return { block: true, reason: decision.reason ?? "Blocked by permission policy" };
	});
}
