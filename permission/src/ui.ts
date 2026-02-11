import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { ImpactAssessment, ImpactLevel } from "./types.js";

type ThemeLike = {
	inverse: (text: string) => string;
	bold: (text: string) => string;
	fg: (token: string, text: string) => string;
};

type PermissionBadgeRenderer = (theme: ThemeLike, label: string) => string | undefined;

let badgeRenderer: PermissionBadgeRenderer | undefined;

export function setPermissionBadgeRenderer(renderer: PermissionBadgeRenderer | undefined): void {
	badgeRenderer = renderer;
}

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

const PERMISSION_TONES = {
	low: "text",
	medium: "warning",
	high: "error",
} satisfies Record<ImpactLevel, "text" | "warning" | "error">;

function defaultBadge(theme: ThemeLike, label: string): string {
	return theme.inverse(theme.bold(` ${label} `));
}

function renderBadge(theme: ThemeLike, label: string): string {
	return badgeRenderer?.(theme, label) ?? defaultBadge(theme, label);
}

export function renderPermissionWidget(ctx: ExtensionContext, level: ImpactLevel): void {
	if (!ctx.hasUI) return;
	const text = PERMISSION_LABELS[level];
	const tone = PERMISSION_TONES[level];
	ctx.ui.setWidget("permission-level", [ctx.ui.theme.fg(tone, text)], { placement: "aboveEditor" });
}

function renderExecuteLine(ctx: ExtensionContext, assessment: ImpactAssessment): string {
	const impact = assessment.unknown ? "unknown" : assessment.level;
	const executeTag = renderBadge(ctx.ui.theme as ThemeLike, "EXECUTE");
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
