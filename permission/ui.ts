import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import { fgHex } from "@mariozechner/pi-ui";
import type { ImpactAssessment, ImpactLevel } from "./types.js";

const COLORS = {
	low: "#4ade80",
	medium: "#fbbf24",
	high: "#f87171",
} satisfies Record<ImpactLevel, string>;

const LABELS = {
	low: "LOW",
	medium: "MED",
	high: "HIGH",
} satisfies Record<ImpactLevel, string>;

export const SELECTOR_DESCRIPTIONS = {
	low: "Low - Auto-approve read-only operations",
	medium: "Medium - Auto-approve local file changes",
	high: "High - Auto-approve most operations (destructive allowed)",
} satisfies Record<ImpactLevel, string>;

export function renderPermissionWidget(ctx: ExtensionContext, level: ImpactLevel): void {
	const color = COLORS[level];
	const text = LABELS[level];
	ctx.ui.setWidget("permission-level", [fgHex(ctx.ui.theme, color, text)], { placement: "aboveEditor" });
}

function renderExecuteLine(ctx: ExtensionContext, assessment: ImpactAssessment): string {
	const icon = assessment.level === "high" ? "⚠️" : assessment.level === "medium" ? "⚡" : "✓";
	const color = COLORS[assessment.level];
	return `${icon} ${assessment.operation} (${fgHex(ctx.ui.theme, color, assessment.level.toUpperCase())})`;
}

export async function askUserPermission(ctx: ExtensionContext, assessment: ImpactAssessment): Promise<boolean> {
	if (!ctx.hasUI) {
		return false;
	}

	const question = `Allow ${assessment.level}-impact operation?\n${renderExecuteLine(ctx, assessment)}`;
	const answer = await ctx.ui.select(question, ["Allow", "Block"]);
	return answer === "Allow";
}
