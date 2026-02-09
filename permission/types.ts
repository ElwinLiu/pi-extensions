export const LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof LEVELS)[number];

export type Rule = {
	pattern: RegExp;
	reason: string;
};

export type RiskAssessment = {
	level: RiskLevel;
	source: string;
	operation: string;
	unknown: boolean;
	reason: string;
};

export type AiRiskClassification = {
	level: RiskLevel;
	reason: string;
};

export const LEVEL_ORDER = {
	low: 0,
	medium: 1,
	high: 2,
} satisfies Record<RiskLevel, number>;

export const DEFAULT_LEVEL: RiskLevel = "medium";

export function isRiskAtMost(level: RiskLevel, threshold: RiskLevel): boolean {
	return LEVEL_ORDER[level] <= LEVEL_ORDER[threshold];
}

export function maxRiskLevel(base: RiskLevel, candidate: RiskLevel): RiskLevel {
	return LEVEL_ORDER[candidate] > LEVEL_ORDER[base] ? candidate : base;
}

export function isRiskLevel(value: unknown): value is RiskLevel {
	return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

export function cycleLevel(level: RiskLevel): RiskLevel {
	const index = LEVELS.indexOf(level);
	return LEVELS[(index + 1) % LEVELS.length];
}
