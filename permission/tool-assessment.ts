import type { ToolCallEvent } from "@mariozechner/pi-coding-agent";

import { classifyBash } from "./rules.js";
import type { RiskAssessment } from "./types.js";

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

export function classifyToolCall(event: ToolCallEvent): RiskAssessment {
	if (event.toolName === "bash") {
		const command = getStringProp(event.input, "command") ?? "";
		const bashRisk = classifyBash(command);
		return { ...bashRisk, source: "agent:bash" };
	}

	if (READ_ONLY_TOOLS.has(event.toolName)) {
		return {
			level: "low",
			source: `agent:${event.toolName}`,
			operation: event.toolName,
			unknown: false,
			reason: "read-only tool",
		};
	}

	if (EDIT_TOOLS.has(event.toolName)) {
		const path = getStringProp(event.input, "path") ?? "(unknown path)";
		return {
			level: "low",
			source: `agent:${event.toolName}`,
			operation: `${event.toolName} ${path}`,
			unknown: false,
			reason: "edit/write tool",
		};
	}

	const serializedInput = serializeForOperation(event.input);
	const operation = serializedInput ? `${event.toolName} ${serializedInput}` : event.toolName;
	return {
		level: "medium",
		source: `agent:${event.toolName}`,
		operation,
		unknown: true,
		reason: "unmapped tool",
	};
}
