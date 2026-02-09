import type { ToolCallEvent, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { AiAssessor } from "./ai-assessment.js";
import { classifyByRules } from "./rules.js";
import { askUserPermission } from "./ui.js";
import { isImpactAtMost, maxImpactLevel } from "./types.js";
import type { ImpactAssessment, ImpactLevel } from "./types.js";

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
 * Assumes command is already normalized.
 * Handles: &&, ||, ;, |, &, |&, and newlines
 */
function splitCompoundCommands(normalized: string): string[] {
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

function toImpactAssessment(normalized: string, result: ReturnType<typeof classifyByRules>): ImpactAssessment {
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
 * sub-command individually and returning the highest impact level.
 */
function classifyBash(command: string): ImpactAssessment {
	const normalized = normalizeCommand(command);
	if (!normalized) {
		return { level: "low", source: "bash", operation: "", unknown: false, reason: "empty" };
	}

	// Split compound commands into individual commands
	const commands = splitCompoundCommands(normalized);

	// If only one command, classify it directly
	if (commands.length === 1) {
		return toImpactAssessment(commands[0], classifyByRules(commands[0]));
	}

	// Classify each command and find the highest impact
	const assessments = commands.map((cmd) => toImpactAssessment(cmd, classifyByRules(cmd)));

	// Find highest impact level (high > medium > low)
	// When impact levels are equal, prefer "known" over "unknown"
	let highestImpact: ImpactAssessment | undefined;
	let hasUnknown = false;

	for (const assessment of assessments) {
		if (assessment.unknown) {
			hasUnknown = true;
		}

		if (!highestImpact) {
			highestImpact = assessment;
			continue;
		}

		const currentPriority = LEVEL_PRIORITY[assessment.level];
		const highestPriority = LEVEL_PRIORITY[highestImpact.level];

		// Prefer higher impact level
		if (currentPriority > highestPriority) {
			highestImpact = assessment;
		} else if (currentPriority === highestPriority) {
			// Same impact level: prefer known over unknown
			if (!assessment.unknown && highestImpact.unknown) {
				highestImpact = assessment;
			}
		}
	}

	if (!highestImpact) {
		return {
			level: "medium",
			source: "bash",
			operation: normalized,
			unknown: true,
			reason: "compound command assessment failed",
		};
	}

	// Build a compound reason showing all commands and their impact levels
	const reasons = assessments
		.map((a) => `${a.operation.substring(0, 30)}${a.operation.length > 30 ? "..." : ""}(${a.level})`)
		.join("; ");

	return {
		level: highestImpact.level,
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
 * - Returns the highest impact level found
 * 
 * For other tools:
 * - Uses predefined categories (read-only, edit, unknown)
 * - Falls back to AI when unknown
 */
export async function classifyToolCall(
	event: ToolCallEvent,
	ctx: ExtensionContext,
	aiAssessor: AiAssessor,
): Promise<ImpactAssessment> {
	let assessment: ImpactAssessment;

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
	return aiAssessor.escalateImpactWithHistory(assessment, ctx);
}

export async function authorize(
	assessment: ImpactAssessment,
	level: ImpactLevel,
	ctx: ExtensionContext,
): Promise<{ allowed: boolean; reason?: string }> {
	const thresholdAllows = !assessment.unknown && isImpactAtMost(assessment.level, level);
	if (thresholdAllows) {
		return { allowed: true };
	}

	const baseReason = assessment.unknown
		? "Blocked unknown-impact operation"
		: `Blocked ${assessment.level}-impact operation`;

	if (!ctx.hasUI) {
		return {
			allowed: false,
			reason: `${baseReason}: ${assessment.operation}`,
		};
	}

	const ok = await askUserPermission(ctx, assessment);
	return ok ? { allowed: true } : { allowed: false, reason: baseReason };
}
