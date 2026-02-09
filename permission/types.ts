export const LEVELS = ["low", "medium", "high"] as const;
export type ImpactLevel = (typeof LEVELS)[number];

export type Rule = {
	pattern: RegExp;
	reason: string;
};

export type ImpactAssessment = {
	level: ImpactLevel;
	source: string;
	operation: string;
	unknown: boolean;
	reason: string;
};

export type AiImpactClassification = {
	level: ImpactLevel;
};

export const LEVEL_ORDER = {
	low: 0,
	medium: 1,
	high: 2,
} satisfies Record<ImpactLevel, number>;

export const DEFAULT_LEVEL: ImpactLevel = "medium";

export function isImpactAtMost(level: ImpactLevel, threshold: ImpactLevel): boolean {
	return LEVEL_ORDER[level] <= LEVEL_ORDER[threshold];
}

export function maxImpactLevel(base: ImpactLevel, candidate: ImpactLevel): ImpactLevel {
	return LEVEL_ORDER[candidate] > LEVEL_ORDER[base] ? candidate : base;
}

export function isImpactLevel(value: unknown): value is ImpactLevel {
	return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

export function cycleLevel(level: ImpactLevel): ImpactLevel {
	const index = LEVELS.indexOf(level);
	return LEVELS[(index + 1) % LEVELS.length];
}
