import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import { fgHex } from "../droid-style/ansi.js";
import { badge } from "../droid-style/tool-tags/common.js";
import type { ImpactAssessment, ImpactLevel } from "./types.js";

export const PERMISSION_LABELS = {
	low: "Perm (Low) - allow edits + read-only commands",
	medium: "Perm (Med) - allow reversible commands",
	high: "Perm (High) - allow all commands",
} satisfies Record<ImpactLevel, string>;

export const SELECTOR_DESCRIPTIONS = {
	low: "low: allow edits + read-only commands",
	medium: "medium: allow reversible commands",
	high: "high: allow all commands",
} satisfies Record<ImpactLevel, string>;

const PERMISSION_COLORS = {
	low: "#ffffff",
	medium: "#e3992b",
	high: "#d56a26",
} satisfies Record<ImpactLevel, string>;

export function renderPermissionWidget(ctx: ExtensionContext, level: ImpactLevel): void {
	if (!ctx.hasUI) return;
	const text = PERMISSION_LABELS[level];
	const color = PERMISSION_COLORS[level];
	ctx.ui.setWidget("permission-level", [fgHex(ctx.ui.theme, color, text)], { placement: "aboveEditor" });
}

function renderExecuteLine(ctx: ExtensionContext, assessment: ImpactAssessment): string {
	const impact = assessment.unknown ? "unknown" : assessment.level;
	const executeTag = badge(ctx.ui.theme, "EXECUTE");
	const detailParts = [
		assessment.operation,
		`impact: ${impact}`,
		assessment.reason ? `reason: ${assessment.reason}` : undefined,
	]
		.filter(Boolean)
		.join(", ");
	const detail = ctx.ui.theme.fg("toolOutput", `(${detailParts})`);
	return `${executeTag} ${detail}`;
}

export async function askUserPermission(ctx: ExtensionContext, assessment: ImpactAssessment): Promise<boolean> {
	const choice = await ctx.ui.select(renderExecuteLine(ctx, assessment), ["Yes, allow", "No, Cancel"]);
	return choice === "Yes, allow";
}
