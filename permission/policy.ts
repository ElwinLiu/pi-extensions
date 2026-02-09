import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import { askUserPermission } from "./ui.js";
import { isRiskAtMost } from "./types.js";
import type { RiskAssessment, RiskLevel } from "./types.js";

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
