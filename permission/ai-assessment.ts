import { complete, type Message } from "@mariozechner/pi-ai";
import { buildSessionContext, convertToLlm } from "@mariozechner/pi-coding-agent";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isImpactLevel } from "./types.js";
import type { AiImpactClassification, ImpactAssessment } from "./types.js";

const AI_IMPACT_ASSESSOR_USER_INSTRUCTIONS = [
	"Permission impact assessment task.",
	"Classify the single operation described below as low, medium, or high impact.",
	"Use prior conversation messages as context for escalation (prod, secrets, destructive intent, remote impact, privilege/security impact).",
	"Definitions:",
	"- low: read-only inspection/query operations with no meaningful mutation.",
	"- medium: mostly local or recoverable mutations.",
	"- high: security-sensitive, destructive, privileged, remote-mutating, or hard-to-reverse actions.",
	"Rules:",
	"- If uncertain, pick the HIGHER impact.",
	"- Return JSON only: {\"level\":\"low|medium|high\"}",
].join("\n");

function truncateForPrompt(value: string, maxLength = 1200): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength)}...`;
}

function coerceAiImpactClassification(value: unknown): AiImpactClassification | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value as { level?: unknown };
	const level = typeof record.level === "string" ? record.level.toLowerCase() : "";
	if (!isImpactLevel(level)) {
		return undefined;
	}
	return { level };
}

function parseAiImpactClassification(raw: string): AiImpactClassification | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;

	try {
		const parsed = JSON.parse(trimmed);
		const normalized = coerceAiImpactClassification(parsed);
		if (normalized) return normalized;
	} catch {
		// fall through
	}

	const jsonBlockMatch = trimmed.match(/\{[\s\S]*\}/);
	if (!jsonBlockMatch) return undefined;

	try {
		return coerceAiImpactClassification(JSON.parse(jsonBlockMatch[0]));
	} catch {
		return undefined;
	}
}

function buildConversationMessages(ctx: ExtensionContext): Message[] {
	const entries = ctx.sessionManager.getEntries();
	const leafId = ctx.sessionManager.getLeafId();
	const sessionContext = buildSessionContext(entries, leafId);
	return convertToLlm(sessionContext.messages);
}

function buildAssessmentMessage(assessment: ImpactAssessment): Message {
	const text = [
		AI_IMPACT_ASSESSOR_USER_INSTRUCTIONS,
		"",
		"<operation>",
		`base_level_from_rules: ${assessment.level}`,
		`unknown_from_rules: ${assessment.unknown}`,
		`source: ${assessment.source}`,
		`operation: ${truncateForPrompt(assessment.operation)}`,
		`previous_rule_reason: ${truncateForPrompt(assessment.reason, 600)}`,
		"</operation>",
	].join("\n");

	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: Date.now(),
	};
}

async function getApiAccess(ctx: ExtensionContext): Promise<{ model: NonNullable<ExtensionContext["model"]>; apiKey: string } | undefined> {
	const model = ctx.model;
	if (!model) return undefined;

	const apiKey = await ctx.modelRegistry.getApiKey(model);
	if (!apiKey) return undefined;

	return { model, apiKey };
}

async function getClassificationFromModel(
	ctx: ExtensionContext,
	assessment: ImpactAssessment,
): Promise<AiImpactClassification | undefined> {
	const access = await getApiAccess(ctx);
	if (!access) return undefined;

	const conversationMessages = buildConversationMessages(ctx);
	const requestMessage = buildAssessmentMessage(assessment);

	try {
		const response = await complete(
			access.model,
			{
				systemPrompt: ctx.getSystemPrompt(),
				messages: [...conversationMessages, requestMessage],
			},
			{
				apiKey: access.apiKey,
				sessionId: ctx.sessionManager.getSessionId(),
			},
		);

		const output = response.content
			.filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
			.map((part) => part.text)
			.join("\n");

		return parseAiImpactClassification(output);
	} catch {
		return undefined;
	}
}

export class AiAssessor {
	async assessImpact(assessment: ImpactAssessment, ctx: ExtensionContext): Promise<ImpactAssessment> {
		if (!assessment.unknown) {
			return assessment;
		}

		const classified = await getClassificationFromModel(ctx, assessment);
		if (!classified) {
			return {
				...assessment,
				level: "high",
				unknown: false,
				reason: "ai-unavailable-default-high",
			};
		}

		return {
			...assessment,
			level: classified.level,
			unknown: false,
			reason: "ai-classified",
		};
	}
}
