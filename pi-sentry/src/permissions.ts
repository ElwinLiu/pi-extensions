import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { PERMISSION_LEVEL_FLAG } from "./constants.js";
import { AiAssessor } from "./ai-assessment.js";
import { PermissionLevelStore } from "./level-store.js";
import { authorize, classifyToolCall } from "./tool-assessment.js";
import { setPermissionBadgeRenderer } from "./ui.js";
import { getGlobalConfigPath, loadConfig, saveCycleShortcut } from "./config-loader.js";

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

	pi.registerShortcut(config.cycle_shortcut, {
		description: "Cycle through permission levels (low → medium → YOLO)",
		handler: () => {
			levelStore.cycle();
		},
	});

	pi.registerCommand("pi-sentry", {
		description: "Set pi-sentry cycle shortcut (example: /pi-sentry ctrl+shift+p)",
		handler: async (args, ctx) => {
			const rawArgs = (args ?? "").trim();
			if (!rawArgs) {
				const current = loadConfig({ cwd: ctx.cwd }).cycle_shortcut;
				ctx.ui.notify(`Current shortcut: ${current}`, "info");
				ctx.ui.notify("Usage: /pi-sentry <key> [--reload]", "info");
				return;
			}

			const parts = rawArgs.split(/\s+/).filter(Boolean);
			const reloadNow = parts.includes("--reload");
			const shortcutParts = parts.filter((part) => part !== "--reload");
			const nextShortcut = shortcutParts.join(" ").trim();

			if (!nextShortcut) {
				ctx.ui.notify("Usage: /pi-sentry <key> [--reload]", "info");
				return;
			}

			if (!saveCycleShortcut(nextShortcut)) {
				ctx.ui.notify(`Failed to persist shortcut to ${getGlobalConfigPath()}`, "error");
				return;
			}

			if (reloadNow) {
				ctx.ui.notify(`Saved shortcut: ${nextShortcut}. Reloading...`, "info");
				await ctx.reload();
				return;
			}

			ctx.ui.notify(`Saved shortcut: ${nextShortcut}`, "info");
			ctx.ui.notify("It will take effect after /reload (or restart pi).", "info");
			return;
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		levelStore.init(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		return {
			systemPrompt: `${event.systemPrompt}\n\nPermission policy active. Current level: ${levelStore.current.toUpperCase()}. Unknown bash command impacts are AI-classified from operation semantics and conversation intent. Other tools use fixed mappings/rules. YOLO level bypasses all checks.`,
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
