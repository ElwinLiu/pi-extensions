import type {
	ExtensionAPI,
	ExtensionContext,
	ToolCallEvent,
	UserBashEventResult,
} from "@mariozechner/pi-coding-agent";
import { fgHex } from "./ansi.js";
import { badge } from "./tool-call-tags.js";

type RiskLevel = "low" | "medium" | "high";

type Rule = {
	pattern: RegExp;
	reason: string;
};

type RiskAssessment = {
	level: RiskLevel;
	source: string;
	operation: string;
	unknown: boolean;
	reason: string;
};

const LEVEL_ORDER: Record<RiskLevel, number> = {
	low: 0,
	medium: 1,
	high: 2,
};

const LEVELS: RiskLevel[] = ["low", "medium", "high"];
const DEFAULT_LEVEL: RiskLevel = "medium";

const PERMISSION_LABELS: Record<RiskLevel, string> = {
	low: "Perm (Low) - edits and read-only commands",
	medium: "Perm (Med) - allow reversible commands",
	high: "Perm (High) - allow all commands",
};

const PERMISSION_COLORS: Record<RiskLevel, string> = {
	low: "#ffffff",
	medium: "#e3992b",
	high: "#d56a26",
};

const LOW_RISK_RULES: Rule[] = [
	{ pattern: /^\s*echo\b/i, reason: "display" },
	{ pattern: /^\s*pwd\b/i, reason: "display" },
	{ pattern: /^\s*whoami\b/i, reason: "display" },
	{ pattern: /^\s*date\b/i, reason: "display" },
	{ pattern: /^\s*ps\b/i, reason: "info" },
	{ pattern: /^\s*top\b/i, reason: "info" },
	{ pattern: /^\s*git\s+(status|log|diff)\b/i, reason: "read-only git" },
	{ pattern: /^\s*(cat|less|head|tail)\b/i, reason: "read-only file" },
];

const MEDIUM_RISK_RULES: Rule[] = [
	{ pattern: /\btouch\b/i, reason: "file mutation" },
	{ pattern: /\bmkdir\b/i, reason: "file mutation" },
	{ pattern: /\bmv\b/i, reason: "file mutation" },
	{ pattern: /\bcp\b/i, reason: "file mutation" },
	{ pattern: /\bnpm\s+install\b/i, reason: "package install" },
	{ pattern: /\bpip(?:3)?\s+install\b/i, reason: "package install" },
	{ pattern: /\bgit\s+(commit|checkout|pull)\b/i, reason: "git mutation" },
	{ pattern: /^\s*make(?:\s|$)/i, reason: "build" },
	{ pattern: /\bnpm\s+run\s+build\b/i, reason: "build" },
	{ pattern: /\bmvn\s+compile\b/i, reason: "build" },
	{ pattern: /(^|[^<])>(?!>)/, reason: "redirect write" },
	{ pattern: />>/, reason: "redirect append" },
];

const HIGH_RISK_RULES: Rule[] = [
	{ pattern: /\bsudo\b/i, reason: "elevated privileges" },
	{ pattern: /\brm\s+(-rf|-fr|--recursive(?:\s+\S+)*\s+--force|--force(?:\s+\S+)*\s+--recursive)\b/i, reason: "destructive delete" },
	{ pattern: /\bcurl\b[^|\n]*\|\s*(bash|sh|zsh|fish)\b/i, reason: "remote execution" },
	{ pattern: /\bwget\b[^|\n]*\|\s*(bash|sh|zsh|fish)\b/i, reason: "remote execution" },
	{ pattern: /\beval\b/i, reason: "dynamic execution" },
	{ pattern: /\bgit\s+push\b/i, reason: "remote mutation" },
	{ pattern: /\b(ufw|iptables|firewall-cmd|nft)\b/i, reason: "firewall change" },
	{ pattern: /\b(docker\s+run\b.*(?:\s-p\s|\s--publish\s)|kubectl\s+port-forward\b|ssh\s+-R\b|ngrok\b|cloudflared\b)/i, reason: "port exposure" },
	{ pattern: /\b(drop|truncate|delete|destroy|wipe)\b.*\b(prod|production|database|db|sensitive)\b/i, reason: "prod/db destructive action" },
	{ pattern: /\b(kubectl|helm|terraform)\b.*\b(apply|delete|destroy)\b.*\b(prod|production)\b/i, reason: "prod infra mutation" },
];

function isRiskLevel(value: string): value is RiskLevel {
	return value === "low" || value === "medium" || value === "high";
}

function cycleLevel(level: RiskLevel): RiskLevel {
	const index = LEVELS.indexOf(level);
	return LEVELS[(index + 1) % LEVELS.length] ?? DEFAULT_LEVEL;
}

function normalizeCommand(command: string): string {
	return command.trim().replace(/\s+/g, " ");
}

function classifyBash(command: string): RiskAssessment {
	const normalized = normalizeCommand(command);
	if (!normalized) {
		return { level: "low", source: "bash", operation: "", unknown: false, reason: "empty" };
	}

	const high = HIGH_RISK_RULES.find((rule) => rule.pattern.test(normalized));
	if (high) {
		return { level: "high", source: "bash", operation: normalized, unknown: false, reason: high.reason };
	}

	const medium = MEDIUM_RISK_RULES.find((rule) => rule.pattern.test(normalized));
	if (medium) {
		return { level: "medium", source: "bash", operation: normalized, unknown: false, reason: medium.reason };
	}

	const low = LOW_RISK_RULES.find((rule) => rule.pattern.test(normalized));
	if (low) {
		return { level: "low", source: "bash", operation: normalized, unknown: false, reason: low.reason };
	}

	return {
		level: "medium",
		source: "bash",
		operation: normalized,
		unknown: true,
		reason: "unmapped command",
	};
}

function classifyToolCall(event: ToolCallEvent): RiskAssessment {
	if (event.toolName === "bash") {
		const input = event.input as { command?: unknown };
		const command = typeof input.command === "string" ? input.command : "";
		const bashRisk = classifyBash(command);
		return { ...bashRisk, source: "agent:bash" };
	}

	if (event.toolName === "read" || event.toolName === "grep" || event.toolName === "find" || event.toolName === "ls") {
		return {
			level: "low",
			source: `agent:${event.toolName}`,
			operation: event.toolName,
			unknown: false,
			reason: "read-only tool",
		};
	}

	if (event.toolName === "write" || event.toolName === "edit") {
		const input = event.input as { path?: unknown };
		const path = typeof input.path === "string" ? input.path : "(unknown path)";
		return {
			level: "low",
			source: `agent:${event.toolName}`,
			operation: `${event.toolName} ${path}`,
			unknown: false,
			reason: "edit/write tool",
		};
	}

	return {
		level: "medium",
		source: `agent:${event.toolName}`,
		operation: event.toolName,
		unknown: true,
		reason: "unmapped tool",
	};
}

function renderPermissionWidget(ctx: ExtensionContext, level: RiskLevel): void {
	if (!ctx.hasUI) return;
	const text = PERMISSION_LABELS[level];
	const color = PERMISSION_COLORS[level];
	ctx.ui.setWidget("permission-level", [fgHex(ctx.ui.theme, color, text)], { placement: "aboveEditor" });
}

function renderExecuteLine(ctx: ExtensionContext, assessment: RiskAssessment): string {
	const impact = assessment.unknown ? "unknown" : assessment.level;
	const executeTag = badge(ctx.ui.theme, "EXECUTE");
	const detail = ctx.ui.theme.fg("toolOutput", `(${assessment.operation}, impact: ${impact})`);
	return `${executeTag} ${detail}`;
}

async function askUserPermission(ctx: ExtensionContext, assessment: RiskAssessment): Promise<boolean> {
	const choice = await ctx.ui.select(renderExecuteLine(ctx, assessment), ["Yes, allow", "No, Cancel"]);
	return choice === "Yes, allow";
}

async function authorize(
	assessment: RiskAssessment,
	level: RiskLevel,
	ctx: ExtensionContext,
): Promise<{ allowed: boolean; reason?: string }> {
	if (assessment.unknown && assessment.source.startsWith("agent:")) {
		if (!ctx.hasUI) {
			return {
				allowed: false,
				reason: `Blocked unknown-risk operation: ${assessment.operation}`,
			};
		}
		const ok = await askUserPermission(ctx, assessment);
		return ok ? { allowed: true } : { allowed: false, reason: "Blocked unknown-risk operation" };
	}

	if (LEVEL_ORDER[assessment.level] <= LEVEL_ORDER[level]) {
		return { allowed: true };
	}

	if (!ctx.hasUI) {
		return {
			allowed: false,
			reason: `Blocked ${assessment.level}-risk operation: ${assessment.operation}`,
		};
	}

	const ok = await askUserPermission(ctx, assessment);
	return ok ? { allowed: true } : { allowed: false, reason: `Blocked ${assessment.level}-risk operation` };
}

function parsePermissionFlag(pi: ExtensionAPI): RiskLevel | undefined {
	const value = pi.getFlag("permission-level") ?? pi.getFlag("--permission-level");
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().toLowerCase();
	return isRiskLevel(normalized) ? normalized : undefined;
}

export type PermissionSystemController = {
	cyclePermission(): void;
};

export function registerPermissionSystem(pi: ExtensionAPI): PermissionSystemController {
	let level: RiskLevel = DEFAULT_LEVEL;
	let latestContext: ExtensionContext | undefined;

	function setLevel(
		nextLevel: RiskLevel,
		ctx: ExtensionContext,
		options?: { persist?: boolean; notify?: boolean },
	): void {
		level = nextLevel;
		if (options?.persist !== false) {
			pi.appendEntry("permission-level", { level });
		}
		renderPermissionWidget(ctx, level);
		if (options?.notify !== false) {
			ctx.ui.notify(`Permission level: ${level.toUpperCase()}`, "info");
		}
	}

	pi.registerFlag("permission-level", {
		description: "Max risk level auto-approved: low | medium | high",
		type: "string",
	});

	pi.registerCommand("permissions", {
		description: "Show or set permission level: /permissions [low|medium|high]",
		getArgumentCompletions: (prefix) => {
			const choices = LEVELS.filter((item) => item.startsWith(prefix.toLowerCase()));
			return choices.length ? choices.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			latestContext = ctx;
			const value = args.trim().toLowerCase();
			if (!value) {
				ctx.ui.notify(`Permission level: ${level.toUpperCase()}`, "info");
				renderPermissionWidget(ctx, level);
				return;
			}
			if (!isRiskLevel(value)) {
				ctx.ui.notify("Usage: /permissions [low|medium|high]", "error");
				return;
			}
			setLevel(value, ctx);
		},
	});

	function cyclePermission(): void {
		if (!latestContext) return;
		const next = cycleLevel(level);
		setLevel(next, latestContext);
	}

	pi.on("session_start", async (_event, ctx) => {
		latestContext = ctx;
		const saved = ctx.sessionManager
			.getEntries()
			.filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === "permission-level")
			.pop() as { data?: { level?: string } } | undefined;

		if (saved?.data?.level && isRiskLevel(saved.data.level)) {
			level = saved.data.level;
		}

		const fromFlag = parsePermissionFlag(pi);
		if (fromFlag) {
			level = fromFlag;
		}

		renderPermissionWidget(ctx, level);
	});

	pi.on("before_agent_start", async (event) => {
		return {
			systemPrompt: `${event.systemPrompt}\n\nPermission policy active. Current level: ${level.toUpperCase()}. Unknown bash/tool risks require approval.`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		latestContext = ctx;
		const assessment = classifyToolCall(event);
		const decision = await authorize(assessment, level, ctx);
		if (decision.allowed) return undefined;
		return { block: true, reason: decision.reason ?? "Blocked by permission policy" };
	});

	pi.on("user_bash", async (event, ctx): Promise<UserBashEventResult | undefined> => {
		latestContext = ctx;
		const assessment = classifyBash(event.command);
		const decision = await authorize(
			{
				...assessment,
				source: "user:bash",
			},
			level,
			ctx,
		);
		if (decision.allowed) return undefined;
		return {
			result: {
				output: decision.reason ?? "Blocked by permission policy",
				exitCode: 1,
				cancelled: false,
				truncated: false,
			},
		};
	});

	return {
		cyclePermission,
	};
}
