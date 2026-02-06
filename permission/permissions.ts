import type {
	ExtensionAPI,
	ExtensionContext,
	ToolCallEvent,
	UserBashEventResult,
} from "@mariozechner/pi-coding-agent";
import { fgHex } from "../droid-style/ansi.js";
import { badge } from "../droid-style/tool-call-tags.js";

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

const SELECTOR_DESCRIPTIONS: Record<RiskLevel, string> = {
	low: "low: edits and read-only commands",
	medium: "medium: allow reversible commands",
	high: "high: allow all commands",
};

const PERMISSION_COLORS: Record<RiskLevel, string> = {
	low: "#ffffff",
	medium: "#e3992b",
	high: "#d56a26",
};

// Rule coverage is based on common command behavior documented by upstream/manual sources:
// GNU coreutils (ls/rm), Git docs (push/reset), Docker docs (publish ports),
// Kubernetes docs (kubectl apply), systemctl man page, npm lifecycle scripts, and Terraform command refs.
const LOW_RISK_RULES: Rule[] = [
	// Display / introspection
	{ pattern: /^\s*(echo|printf)\b/i, reason: "display" },
	{ pattern: /^\s*(pwd|whoami|id|groups|date|uname|hostname|uptime)\b/i, reason: "system info" },
	{ pattern: /^\s*(env|printenv|which|type)\b/i, reason: "environment info" },
	{ pattern: /^\s*(ls|tree)\b/i, reason: "read-only listing" },
	{ pattern: /^\s*(cat|less|more|head|tail|wc|stat|file)\b/i, reason: "read-only file" },
	{ pattern: /^\s*sed\b(?![^\n]*\s-i\b)/i, reason: "text processing" },
	{ pattern: /^\s*(grep|egrep|fgrep|awk|cut|sort|uniq|tr|column|nl)\b/i, reason: "text processing" },
	{ pattern: /^(?!.*\b(delete|exec|ok)\b)\s*find\b/i, reason: "file discovery" },

	// Process, network, resource inspection
	{ pattern: /^\s*(ps|top|htop|pgrep|pstree|lsof|ss|netstat|df|du|free|vmstat|iostat|dmesg)\b/i, reason: "runtime inspection" },
	{ pattern: /^\s*(md5sum|sha1sum|sha256sum|sha512sum|cksum|b2sum)\b/i, reason: "checksums" },

	// Git read-only operations
	{ pattern: /^\s*git\s+(status|log|show|diff|blame|grep|rev-parse|rev-list|ls-files|ls-tree|cat-file)\b/i, reason: "read-only git" },
	{ pattern: /^\s*git\s+branch\b(?![^\n]*\s-[dDmM])/i, reason: "read-only git branch view" },
	{ pattern: /^\s*git\s+tag\b(?![^\n]*\s-d\b)/i, reason: "read-only git tag view" },
	{ pattern: /^\s*git\s+remote\s+-v\b/i, reason: "read-only git remote view" },
	{ pattern: /^\s*git\s+stash\s+list\b/i, reason: "read-only git stash view" },

	// Package manager read-only queries
	{ pattern: /^\s*(npm|pnpm|yarn)\s+(ls|list|outdated|info|view)\b/i, reason: "package query" },
	{ pattern: /^\s*(pip|pip3)\s+(list|show|freeze)\b/i, reason: "package query" },
	{ pattern: /^\s*(brew)\s+(list|info|search)\b/i, reason: "package query" },
	{ pattern: /^\s*(apt|apt-cache)\s+(list|search|show|policy)\b/i, reason: "package query" },

	// GitHub CLI read-only queries
	{ pattern: /^\s*gh\s+(--version|version|help|auth\s+status|repo\s+view|issue\s+view|pr\s+view|run\s+view|run\s+list|api\s+\/repos\/[^\s]+\/[^\s]+\/actions\/runs)\b/i, reason: "github query" },

	// Infra/container read-only queries
	{ pattern: /^\s*docker\s+(ps|images|inspect|logs|stats|top|events|version|info)\b/i, reason: "container query" },
	{ pattern: /^\s*kubectl\s+(get|describe|logs|api-resources|api-versions|version|config\s+view)\b/i, reason: "cluster query" },
	{ pattern: /^\s*helm\s+(list|status|history|get)\b/i, reason: "release query" },
	{ pattern: /^\s*terraform\s+(validate|show|plan)\b/i, reason: "infra plan/query" },
];

const MEDIUM_RISK_RULES: Rule[] = [
	// Local file mutations (usually recoverable)
	{ pattern: /\b(touch|mkdir|rmdir|cp|mv|ln|install)\b/i, reason: "file mutation" },
	{ pattern: /^\s*sed\b[^\n]*\s-i\b/i, reason: "in-place file edit" },
	{ pattern: /(^|[^<])>(?!>)/, reason: "redirect write" },
	{ pattern: />>/, reason: "redirect append" },
	{ pattern: /\btee\b/i, reason: "write via tee" },

	// Git local history/index mutations (recoverable with effort)
	{ pattern: /^\s*git\s+(add|restore|checkout|switch|commit|merge|rebase|cherry-pick|revert|pull|fetch|stash(?!\s+list\b))\b/i, reason: "git mutation" },

	// Language/package ecosystem mutations
	{ pattern: /^\s*(npm|pnpm|yarn)\s+(install|add|update|upgrade|remove|uninstall|ci)\b/i, reason: "package mutation" },
	{ pattern: /^\s*npx\b/i, reason: "one-off package/script execution" },
	{ pattern: /^\s*(pip|pip3)\s+(install|uninstall)\b/i, reason: "package mutation" },
	{ pattern: /^\s*(cargo|go|gem|bundle|poetry|uv)\s+(install|add|get|update|remove|sync)\b/i, reason: "package/toolchain mutation" },
	{ pattern: /^\s*terraform\s+fmt\b/i, reason: "source formatting mutation" },

	// Build/test execution (side effects typically local)
	{ pattern: /^\s*(make|cmake|ninja|meson|mvn|gradle|\.\/gradlew)\b/i, reason: "build pipeline" },
	{ pattern: /^\s*(pytest|jest|vitest)\b/i, reason: "test run" },
	{ pattern: /^\s*(go\s+test|cargo\s+test)\b/i, reason: "test run" },
	{ pattern: /^\s*(npm|pnpm|yarn)\s+run\s+\S+/i, reason: "script run" },

	// Service/container operations with local side effects
	{ pattern: /^\s*(systemctl|service|launchctl)\s+(start|stop|restart|reload|enable|disable)\b/i, reason: "service state mutation" },
	{ pattern: /^\s*docker\s+(build|pull|compose\s+(up|down|build|pull)|start|stop|restart|rm|rmi|run)\b/i, reason: "container mutation" },
];

const HIGH_RISK_RULES: Rule[] = [
	// Privilege escalation / identity changes
	{ pattern: /\b(sudo|doas|su|pkexec)\b/i, reason: "elevated privileges" },
	{ pattern: /\b(useradd|userdel|usermod|groupadd|groupdel|passwd)\b/i, reason: "identity/security mutation" },

	// Irreversible/destructive filesystem & disk actions
	{ pattern: /\brm\b/i, reason: "destructive delete" },
	{ pattern: /\b(shred|wipefs|mkfs(?:\.\w+)?|fdisk|parted|sgdisk)\b/i, reason: "disk/filesystem destructive action" },
	{ pattern: /\bdd\b[^\n]*\bof=\/dev\//i, reason: "raw disk write" },
	{ pattern: /\btruncate\b/i, reason: "destructive truncate" },
	{ pattern: /^\s*diskutil\s+erase/i, reason: "disk erase" },

	// Security-sensitive permission/firewall/system tuning actions
	{ pattern: /\b(chown|chgrp|chmod|setfacl|setcap|visudo|chattr)\b/i, reason: "permission/security mutation" },
	{ pattern: /\b(ufw|iptables|nft|firewall-cmd|pfctl|sysctl)\b/i, reason: "network/system security mutation" },
	{ pattern: /\b(reboot|shutdown|halt|poweroff|init\s+[06])\b/i, reason: "system availability impact" },

	// Remote code execution patterns
	{ pattern: /\bcurl\b[^|\n]*\|\s*(bash|sh|zsh|fish)\b/i, reason: "remote execution" },
	{ pattern: /\bwget\b[^|\n]*\|\s*(bash|sh|zsh|fish)\b/i, reason: "remote execution" },
	{ pattern: /\biwr\b[^|\n]*\|\s*iex\b/i, reason: "remote execution" },
	{ pattern: /\binvoke-webrequest\b[^|\n]*\|\s*invoke-expression\b/i, reason: "remote execution" },
	{ pattern: /\beval\b/i, reason: "dynamic execution" },

	// Remote mutation / exposure
	{ pattern: /\bgit\s+push\b/i, reason: "remote mutation" },
	{ pattern: /^\s*gh\s+(issue\s+(create|edit|close|reopen|delete)|pr\s+(create|merge|close|reopen|ready|review)|repo\s+(create|delete|rename|edit)|release\s+create|secret\s+set|variable\s+set|workflow\s+run|run\s+rerun|api\s+.*\b(POST|PUT|PATCH|DELETE)\b)/i, reason: "github remote mutation" },
	{ pattern: /\bgit\s+reset\b[^\n]*--hard\b/i, reason: "destructive history rewrite" },
	{ pattern: /\bgit\s+clean\b[^\n]*\s-f\b/i, reason: "destructive workspace clean" },
	{ pattern: /\bgit\s+branch\b[^\n]*\s-[dD]\b/i, reason: "branch deletion" },
	{ pattern: /\bgit\s+tag\b[^\n]*\s-d\b/i, reason: "tag deletion" },
	{ pattern: /\b(docker\s+run\b[^\n]*(\s-p\s|\s--publish\s|\s--network\s+host\b|\s--privileged\b)|kubectl\s+port-forward\b|ssh\s+-R\b|nc\b[^\n]*\s-l\b|socat\b[^\n]*\bLISTEN\b|ngrok\b|cloudflared\b|localtunnel\b)/i, reason: "port exposure" },

	// Infra orchestration / destructive remote control
	{ pattern: /\bterraform\s+(apply|destroy|state\s+rm|taint|import)\b/i, reason: "infra mutation" },
	{ pattern: /\bkubectl\s+(apply|create|delete|replace|patch|edit|scale|set|drain|cordon|uncordon|rollout\s+(restart|undo))\b/i, reason: "cluster mutation" },
	{ pattern: /\bhelm\s+(install|upgrade|rollback|uninstall|delete)\b/i, reason: "release mutation" },
	{ pattern: /\bansible-playbook\b/i, reason: "remote orchestration mutation" },

	// System package manager changes (broad machine impact)
	{ pattern: /\b(apt(?:-get)?|dnf|yum|pacman|zypper)\s+(install|upgrade|dist-upgrade|remove|purge|autoremove)\b/i, reason: "system package mutation" },
	{ pattern: /\bbrew\s+(install|upgrade|uninstall|tap|untap|services\s+(start|stop|restart))\b/i, reason: "system package/service mutation" },

	// Database destructive intent
	{ pattern: /\b(drop|truncate|delete|destroy|wipe)\b[^\n]*\b(table|database|schema|collection|index|prod|production|db|sensitive)\b/i, reason: "database/data destructive action" },
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

export function registerPermissionSystem(pi: ExtensionAPI): void {
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

	function cyclePermission(): void {
		if (!latestContext) return;
		const next = cycleLevel(level);
		setLevel(next, latestContext, { notify: false });
	}

	pi.registerFlag("permission-level", {
		description: "Max risk level auto-approved: low | medium | high",
		type: "string",
	});

	pi.registerCommand("permission", {
		description: "Show or set permission level: /permission [low|medium|high]",
		getArgumentCompletions: (prefix) => {
			const choices = LEVELS.filter((item) => item.startsWith(prefix.toLowerCase()));
			return choices.length ? choices.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			latestContext = ctx;
			const value = args.trim().toLowerCase();
			
			// If no argument provided, show selector with all three options
			if (!value) {
				const descriptions = LEVELS.map((lvl) => SELECTOR_DESCRIPTIONS[lvl]);

				const choice = await ctx.ui.select("Select permission level:", descriptions);

				if (!choice) return;

				const selectedLevel = LEVELS.find((lvl) => SELECTOR_DESCRIPTIONS[lvl] === choice);
				if (selectedLevel && isRiskLevel(selectedLevel)) {
					setLevel(selectedLevel, ctx);
				}
				return;
			}
			
			// Direct level setting
			if (!isRiskLevel(value)) {
				ctx.ui.notify("Usage: /permission [low|medium|high]", "error");
				return;
			}
			setLevel(value, ctx);
		},
	});

	// Register native Shift+Tab shortcut
	pi.registerShortcut("shift+tab", {
		description: "Cycle permission levels",
		handler: () => {
			cyclePermission();
		},
	});

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

}
