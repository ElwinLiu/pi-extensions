import { complete } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isImpactLevel, maxImpactLevel } from "./types.js";
import type { AiImpactClassification, ImpactAssessment } from "./types.js";

const AI_CLASSIFIER_SYSTEM_PROMPT = [
	"You are a strict command impact classifier.",
	"Classify one operation as low, medium, or high impact.",
	"Definitions:",
	"- low: read-only inspection/query operations with no meaningful mutation.",
	"- medium: mostly local or recoverable mutations.",
	"- high: security-sensitive, destructive, privileged, remote-mutating, or hard-to-reverse actions.",
	"Rules:",
	"- If uncertain, pick the HIGHER impact.",
	"- Return JSON only: {\"level\":\"low|medium|high\"}",
].join("\n");

const AI_HISTORY_ESCALATOR_SYSTEM_PROMPT = [
	"You are a strict impact escalation classifier.",
	"Given a base impact level for a command/tool operation and recent user intent context, return the FINAL impact level.",
	"Allowed levels: low, medium, high.",
	"Rules:",
	"- Never return a level lower than base_level.",
	"- Escalate when context suggests sensitive targets (prod, secrets, destructive intent, remote impact, privilege/security impact).",
	"- If uncertain, keep base_level or escalate higher.",
	"- Return JSON only: {\"level\":\"low|medium|high\"}",
].join("\n");

const AI_CLASSIFIER_CACHE_LIMIT = 500;
const HISTORY_CONTEXT_MESSAGES = 3;
const HISTORY_CONTEXT_MAX_CHARS = 350;

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

function extractTextParts(content: unknown): string[] {
	if (typeof content === "string") {
		return [content];
	}
	if (!Array.isArray(content)) {
		return [];
	}

	const parts: string[] = [];
	for (const item of content) {
		if (!item || typeof item !== "object") continue;
		const block = item as { type?: unknown; text?: unknown };
		if (block.type === "text" && typeof block.text === "string" && block.text.trim().length > 0) {
			parts.push(block.text);
		}
	}
	return parts;
}

function buildRecentUserIntentContext(ctx: ExtensionContext): string {
	const branchUnknown = ctx.sessionManager.getBranch() as unknown;
	const entries = Array.isArray(branchUnknown) ? branchUnknown : [];
	const snippets: string[] = [];

	for (let i = entries.length - 1; i >= 0 && snippets.length < HISTORY_CONTEXT_MESSAGES; i -= 1) {
		const entry = entries[i] as { type?: unknown; message?: { role?: unknown; content?: unknown } };
		if (entry?.type !== "message") continue;
		if (entry.message?.role !== "user") continue;

		const text = extractTextParts(entry.message.content).join("\n").trim();
		if (!text) continue;
		snippets.push(truncateForPrompt(text, HISTORY_CONTEXT_MAX_CHARS));
	}

	if (snippets.length === 0) return "";
	return snippets
		.reverse()
		.map((snippet, index) => `user_${index + 1}: ${snippet}`)
		.join("\n");
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
	prompt: string,
): Promise<AiImpactClassification | undefined> {
	const access = await getApiAccess(ctx);
	if (!access) return undefined;

	try {
		const response = await complete(
			access.model,
			{
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: prompt }],
						timestamp: Date.now(),
					},
				],
			},
			{ apiKey: access.apiKey },
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

export class AiImpactAssessor {
	private readonly cache = new Map<string, AiImpactClassification>();

	async classifyUnknownWithAi(assessment: ImpactAssessment, ctx: ExtensionContext): Promise<ImpactAssessment> {
		if (!assessment.unknown) {
			return assessment;
		}

		const cacheKey = `${assessment.source}:${assessment.operation}`;
		const cached = this.cache.get(cacheKey);
		if (cached) {
			return {
				...assessment,
				level: cached.level,
				unknown: false,
				reason: "ai-classified",
			};
		}

		const prompt = [
			AI_CLASSIFIER_SYSTEM_PROMPT,
			"",
			`source: ${assessment.source}`,
			`operation: ${truncateForPrompt(assessment.operation)}`,
			`previous_rule_reason: ${assessment.reason}`,
		].join("\n");

		const classified = await getClassificationFromModel(ctx, prompt);
		if (!classified) {
			return assessment;
		}

		if (this.cache.size >= AI_CLASSIFIER_CACHE_LIMIT) {
			const oldestKey = this.cache.keys().next().value as string | undefined;
			if (oldestKey) this.cache.delete(oldestKey);
		}
		this.cache.set(cacheKey, classified);

		return {
			...assessment,
			level: classified.level,
			unknown: false,
			reason: "ai-classified",
		};
	}

	async escalateImpactWithHistory(assessment: ImpactAssessment, ctx: ExtensionContext): Promise<ImpactAssessment> {
		if (assessment.unknown) {
			return assessment;
		}

		const historyContext = buildRecentUserIntentContext(ctx);
		if (!historyContext) {
			return assessment;
		}

		const prompt = [
			AI_HISTORY_ESCALATOR_SYSTEM_PROMPT,
			"",
			`base_level: ${assessment.level}`,
			`source: ${assessment.source}`,
			`operation: ${truncateForPrompt(assessment.operation)}`,
			"recent_user_intent:",
			historyContext,
		].join("\n");

		const escalated = await getClassificationFromModel(ctx, prompt);
		if (!escalated) {
			return assessment;
		}

		const finalLevel = maxImpactLevel(assessment.level, escalated.level);
		if (finalLevel === assessment.level) {
			return assessment;
		}

		return {
			...assessment,
			level: finalLevel,
			reason: "history-escalated",
		};
	}

	async refineUnknownAssessment(assessment: ImpactAssessment, ctx: ExtensionContext): Promise<ImpactAssessment> {
		if (!assessment.unknown) {
			return assessment;
		}
		const classified = await this.classifyUnknownWithAi(assessment, ctx);
		return this.escalateImpactWithHistory(classified, ctx);
	}
}
