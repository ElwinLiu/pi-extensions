import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { ImpactAssessment, PermissionLevel } from "./types.js";
import { loadConfig } from "./config-loader.js";

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
	YOLO: "Perm (YOLO) - bypass all commands",
} satisfies Record<PermissionLevel, string>;

// Derive selector descriptions by stripping "Perm (X) - " prefix
export const SELECTOR_DESCRIPTIONS = Object.fromEntries(
	Object.entries(PERMISSION_LABELS).map(([level, label]) => [
		level,
		label.replace(/^Perm \([^)]+\) - /, ""),
	])
) as Record<PermissionLevel, string>;

const PERMISSION_TONES = {
	low: "text",
	medium: "warning",
	YOLO: "error",
} satisfies Record<PermissionLevel, "text" | "warning" | "error">;

function defaultBadge(theme: ThemeLike, label: string): string {
	return theme.inverse(theme.bold(` ${label} `));
}

function renderBadge(theme: ThemeLike, label: string): string {
	return badgeRenderer?.(theme, label) ?? defaultBadge(theme, label);
}

export function renderPermissionWidget(ctx: ExtensionContext, level: PermissionLevel): void {
	if (!ctx.hasUI) return;
	const config = loadConfig();
	const text = PERMISSION_LABELS[level];
	const tone = PERMISSION_TONES[level];
	const shortcutHint = ctx.ui.theme.fg("dim", ` (${config.shortcut} to cycle)`);
	ctx.ui.setWidget("permission-level", [ctx.ui.theme.fg(tone, text) + shortcutHint], { placement: "aboveEditor" });
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
