import type { ToolCallEvent, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { AiRiskAssessor } from "./ai-risk.js";
import { classifyByRules } from "./rules.js";
import { askUserPermission } from "./ui.js";
import { isRiskAtMost, maxRiskLevel } from "./types.js";
import type { RiskAssessment, RiskLevel } from "./types.js";

const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls"]);
const EDIT_TOOLS = new Set(["write", "edit"]);

const LEVEL_PRIORITY = { high: 3, medium: 2, low: 1 } as const;

function truncateForPrompt(value: string, maxLength = 300): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength)}...`;
}

function getStringProp(input: unknown, key: string): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const record = input as Record<string, unknown>;
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function serializeForOperation(input: unknown): string {
	try {
		const serialized = JSON.stringify(input);
		if (!serialized) return "";
		return truncateForPrompt(serialized);
	} catch {
		return "";
	}
}

function normalizeCommand(command: string): string {
	return command.trim().replace(/\s+/g, " ");
}

/**
 * Split a compound command into individual commands based on shell operators.
 * Handles: &&, ||, ;, |, &, |&, and newlines
 */
function splitCompoundCommands(command: string): string[] {
	const normalized = normalizeCommand(command);
	if (!normalized) return [];

	// Split by common shell command separators
	// Pattern matches: &&, ||, ;, |, |&, &, and newlines
	const parts = normalized.split(/(\s*&&\s*|\s*\|\|\s*|\s*;\s*|\s*\|&\s*|\s*\|\s*|\s*&\s*|\n)/);

	// Filter out empty strings, separators, and whitespace-only parts
	const commands: string[] = [];
	for (const part of parts) {
		const trimmed = part.trim();
		if (
			trimmed &&
			trimmed !== "&&" &&
			trimmed !== "||" &&
			trimmed !== ";" &&
			trimmed !== "|" &&
			trimmed !== "|&" &&
			trimmed !== "&"
		) {
			commands.push(trimmed);
		}
	}

	return commands.length > 0 ? commands : [normalized];
}

/**
 * Classify a single bash command using rule-based classification.
 * Returns the highest risk level found.
 */
function classifyBashSingle(command: string): RiskAssessment {
	const normalized = normalizeCommand(command);
	if (!normalized) {
		return { level: "low", source: "bash", operation: "", unknown: false, reason: "empty" };
	}

	const result = classifyByRules(command);
	return {
		level: result.level,
		source: "bash",
		operation: normalized,
		unknown: result.unknown,
		reason: result.reason,
	};
}

/**
 * Classify a bash command, handling compound commands by assessing each
 * sub-command individually and returning the highest risk level.
 */
function classifyBash(command: string): RiskAssessment {
	const normalized = normalizeCommand(command);
	if (!normalized) {
		return { level: "low", source: "bash", operation: "", unknown: false, reason: "empty" };
	}

	// Split compound commands into individual commands
	const commands = splitCompoundCommands(command);

	// If only one command, classify it directly
	if (commands.length === 1) {
		return classifyBashSingle(commands[0]);
	}

	// Classify each command and find the highest risk
	const assessments = commands.map((cmd) => classifyBashSingle(cmd));

	// Find highest risk level (high > medium > low)
	// When risk levels are equal, prefer "known" over "unknown"
	let highestRisk: RiskAssessment | undefined;
	let hasUnknown = false;

	for (const assessment of assessments) {
		if (assessment.unknown) {
			hasUnknown = true;
		}

		if (!highestRisk) {
			highestRisk = assessment;
			continue;
		}

		const currentPriority = LEVEL_PRIORITY[assessment.level];
		const highestPriority = LEVEL_PRIORITY[highestRisk.level];

		// Prefer higher risk level
		if (currentPriority > highestPriority) {
			highestRisk = assessment;
		} else if (currentPriority === highestPriority) {
			// Same risk level: prefer known over unknown
			if (!assessment.unknown && highestRisk.unknown) {
				highestRisk = assessment;
			}
		}
	}

	if (!highestRisk) {
		return {
			level: "medium",
			source: "bash",
			operation: normalized,
			unknown: true,
			reason: "compound command assessment failed",
		};
	}

	// Build a compound reason showing all commands and their risk levels
	const reasons = assessments
		.map((a) => `${a.operation.substring(0, 30)}${a.operation.length > 30 ? "..." : ""}(${a.level})`)
		.join("; ");

	return {
		level: highestRisk.level,
		source: "bash",
		operation: normalized,
		unknown: hasUnknown,
		reason: `compound: ${reasons}`,
	};
}

/**
 * Unified function to classify any tool call.
 * 
 * For bash commands:
 * - Splits compound commands into individual sub-commands
 * - Classifies each using rule-based matching
 * - Falls back to AI for unknown commands
 * - Returns the highest risk level found
 * 
 * For other tools:
 * - Uses predefined categories (read-only, edit, unknown)
 * - Falls back to AI when unknown
 */
export async function classifyToolCall(
	event: ToolCallEvent,
	ctx: ExtensionContext,
	aiAssessor: AiRiskAssessor,
): Promise<RiskAssessment> {
	let assessment: RiskAssessment;

	if (event.toolName === "bash") {
		const command = getStringProp(event.input, "command") ?? "";
		assessment = classifyBash(command);
		assessment = { ...assessment, source: "agent:bash" };

		// If any part is unknown, use AI to classify the whole command
		if (assessment.unknown) {
			assessment = await aiAssessor.classifyUnknownWithAi(assessment, ctx);
		}
	} else if (READ_ONLY_TOOLS.has(event.toolName)) {
		assessment = {
			level: "low",
			source: `agent:${event.toolName}`,
			operation: event.toolName,
			unknown: false,
			reason: "read-only tool",
		};
	} else if (EDIT_TOOLS.has(event.toolName)) {
		const path = getStringProp(event.input, "path") ?? "(unknown path)";
		assessment = {
			level: "low",
			source: `agent:${event.toolName}`,
			operation: `${event.toolName} ${path}`,
			unknown: false,
			reason: "edit/write tool",
		};
	} else {
		const serializedInput = serializeForOperation(event.input);
		const operation = serializedInput ? `${event.toolName} ${serializedInput}` : event.toolName;
		assessment = {
			level: "medium",
			source: `agent:${event.toolName}`,
			operation,
			unknown: true,
			reason: "unmapped tool",
		};
	}

	// If still unknown after rule-based classification, use AI
	if (assessment.unknown) {
		assessment = await aiAssessor.classifyUnknownWithAi(assessment, ctx);
	}

	// Apply history-based escalation for known operations
	return aiAssessor.escalateRiskWithHistory(assessment, ctx);
}

export async function authorize(
	assessment: RiskAssessment,
	level: RiskLevel,
	ctx: ExtensionContext,
): Promise<{ allowed: boolean; reason?: string }> {
	const thresholdAllows = !assessment.unknown && isRiskAtMost(assessment.level, level);
	if (thresholdAllows) {
		return { allowed: true };
	}

	const baseReason = assessment.unknown
		? "Blocked unknown-risk operation"
		: `Blocked ${assessment.level}-risk operation`;

	if (!ctx.hasUI) {
		return {
			allowed: false,
			reason: `${baseReason}: ${assessment.operation}`,
		};
	}

	const ok = await askUserPermission(ctx, assessment);
	return ok ? { allowed: true } : { allowed: false, reason: baseReason };
}
