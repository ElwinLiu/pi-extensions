import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { ImpactAssessment, ImpactLevel } from "./types.js";

const THEME_COLORS = {
	low: "success",
	medium: "warning",
	high: "error",
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
	const theme = ctx.ui.theme;
	const colorName = THEME_COLORS[level];
	const text = LABELS[level];
	const coloredText = theme ? theme.fg(colorName, text) : text;
	ctx.ui.setWidget("permission-level", [coloredText], { placement: "aboveEditor" });
}

function renderExecuteLine(ctx: ExtensionContext, assessment: ImpactAssessment): string {
	const icon = assessment.level === "high" ? "⚠️" : assessment.level === "medium" ? "⚡" : "✓";
	const theme = ctx.ui.theme;
	const colorName = THEME_COLORS[assessment.level];
	const levelText = assessment.level.toUpperCase();
	const coloredLevel = theme ? theme.fg(colorName, levelText) : levelText;
	return `${icon} ${assessment.operation} (${coloredLevel})`;
}

export async function askUserPermission(ctx: ExtensionContext, assessment: ImpactAssessment): Promise<boolean> {
	if (!ctx.hasUI) {
		return false;
	}

	const question = `Allow ${assessment.level}-impact operation?\n${renderExecuteLine(ctx, assessment)}`;
	const answer = await ctx.ui.select(question, ["Allow", "Block"]);
	return answer === "Allow";
}
