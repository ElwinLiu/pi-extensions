import type { ToolCallEvent, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { AiRiskAssessor } from "./ai-risk.js";
import { classifyBash } from "./rules.js";
import { askUserPermission } from "./ui.js";
import { isRiskAtMost } from "./types.js";
import type { RiskAssessment, RiskLevel } from "./types.js";

const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls"]);
const EDIT_TOOLS = new Set(["write", "edit"]);

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

export async function classifyToolCall(
	event: ToolCallEvent,
	ctx: ExtensionContext,
	aiAssessor: AiRiskAssessor,
): Promise<RiskAssessment> {
	let assessment: RiskAssessment;

	if (event.toolName === "bash") {
		const command = getStringProp(event.input, "command") ?? "";
		const bashRisk = classifyBash(command);
		assessment = { ...bashRisk, source: "agent:bash" };
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

	// If not unknown, use AI to assess/escalate the risk
	if (!assessment.unknown) {
		return aiAssessor.escalateRiskWithHistory(assessment, ctx);
	}

	return assessment;
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
