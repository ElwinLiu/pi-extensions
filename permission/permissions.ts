import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { PERMISSION_LEVEL_FLAG } from "./constants.js";
import { AiImpactAssessor } from "./ai-impact.js";
import { PermissionLevelStore } from "./level-store.js";
import { authorize, classifyToolCall } from "./tool-assessment.js";
import { SELECTOR_DESCRIPTIONS } from "./ui.js";
import { isImpactLevel, LEVELS } from "./types.js";
import type { ImpactLevel } from "./types.js";

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
	const aiImpactAssessor = new AiImpactAssessor();

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

	pi.registerShortcut("shift+tab", {
		description: "Cycle permission levels",
		handler: () => {
			levelStore.cycle();
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		levelStore.init(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		return {
			systemPrompt: `${event.systemPrompt}\n\nPermission policy active. Current level: ${levelStore.current.toUpperCase()}. Unknown bash/tool impacts are AI-classified from operation semantics; recent user intent may only escalate impact, never reduce it.`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		levelStore.setLatestContext(ctx);
		const assessment = await classifyToolCall(event, ctx, aiImpactAssessor);
		const decision = await authorize(assessment, levelStore.current, ctx);
		if (decision.allowed) return undefined;
		return { block: true, reason: decision.reason ?? "Blocked by permission policy" };
	});

}
