import type { ToolCallEvent, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { AiAssessor } from "./ai-assessment.js";
import { classifyCommandByRules } from "../rules.js";
import { askUserPermission } from "./ui.js";
import { isImpactAtMost, maxImpactLevel } from "./types.js";
import type { ImpactAssessment, ImpactLevel, PermissionLevel } from "./types.js";

const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls"]);
const WRITE_TOOLS = new Set(["write"]);
const EDIT_TOOLS = new Set(["edit"]);
const BASH_SOURCE = "agent:bash";

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
 * Split a compound command into individual commands based on common shell separators.
 * Assumes command is already normalized.
 */
function splitCompoundCommands(normalized: string): string[] {
	if (!normalized) return [];
	return normalized
		.split(/\s*(?:&&|\|\||;|\|&|\||&|\n)\s*/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function toImpactAssessment(normalized: string, result: ReturnType<typeof classifyCommandByRules>): ImpactAssessment {
	return {
		level: result.level,
		source: BASH_SOURCE,
		operation: normalized,
		unknown: result.unknown,
		reason: result.reason,
	};
}

function pickMoreImpactful(current: ImpactAssessment, candidate: ImpactAssessment): ImpactAssessment {
	const higherLevel = maxImpactLevel(current.level, candidate.level);
	if (higherLevel !== current.level) return candidate;
	if (higherLevel !== candidate.level) return current;
	if (current.unknown && !candidate.unknown) return candidate;
	return current;
}

function summarizeAssessment(assessment: ImpactAssessment): string {
	const operation = truncateForPrompt(assessment.operation, 30);
	return `${operation}(${assessment.level})`;
}

/**
 * Rule-only bash classification.
 * Classifies the full command and each sub-command, then returns the highest impact.
 */
function classifyBashByRules(command: string): ImpactAssessment {
	const normalized = normalizeCommand(command);
	if (!normalized) {
		return { level: "low", source: BASH_SOURCE, operation: "", unknown: false, reason: "empty" };
	}

	const overallAssessment = toImpactAssessment(normalized, classifyCommandByRules(normalized));
	const subCommands = splitCompoundCommands(normalized);

	if (subCommands.length <= 1) {
		return overallAssessment;
	}

	let highestAssessment = overallAssessment;
	const reasonParts: string[] = [`whole:${summarizeAssessment(overallAssessment)}`];

	for (const subCommand of subCommands) {
		const assessment = toImpactAssessment(subCommand, classifyCommandByRules(subCommand));
		highestAssessment = pickMoreImpactful(highestAssessment, assessment);
		reasonParts.push(`part:${summarizeAssessment(assessment)}`);
	}

	return {
		...highestAssessment,
		operation: normalized,
		unknown: highestAssessment.unknown,
		reason: `compound: ${reasonParts.join("; ")}`,
	};
}

/**
 * Classify a bash command with rule-based analysis + AI fallback for unknown commands.
 */
async function classifyBash(command: string, ctx: ExtensionContext, aiAssessor: AiAssessor): Promise<ImpactAssessment> {
	const ruleAssessment = classifyBashByRules(command);
	if (!ruleAssessment.unknown) {
		return ruleAssessment;
	}
	return aiAssessor.assessBashImpact(ruleAssessment, ctx);
}

/**
 * Unified function to classify any tool call.
 */
export async function classifyToolCall(
	event: ToolCallEvent,
	ctx: ExtensionContext,
	aiAssessor: AiAssessor,
): Promise<ImpactAssessment> {
	let assessment: ImpactAssessment;

	if (event.toolName === "bash") {
		const command = getStringProp(event.input, "command") ?? "";
		return classifyBash(command, ctx, aiAssessor);
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
			reason: "edit tool",
		};
	} else if (WRITE_TOOLS.has(event.toolName)) {
		const path = getStringProp(event.input, "path") ?? "(unknown path)";
		assessment = {
			level: "medium",
			source: `agent:${event.toolName}`,
			operation: `${event.toolName} ${path}`,
			unknown: false,
			reason: "write tool",
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

	return assessment;
}

export async function authorize(
	assessment: ImpactAssessment,
	level: PermissionLevel,
	ctx: ExtensionContext,
): Promise<{ allowed: boolean; reason?: string }> {
	// Map permission level to max allowed impact level
	const maxAllowedImpact: ImpactLevel = level === "medium" ? "medium" : "low";
	const thresholdAllows = !assessment.unknown && isImpactAtMost(assessment.level, maxAllowedImpact);
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
