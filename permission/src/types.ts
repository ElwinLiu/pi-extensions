export const LEVELS = ["low", "medium", "YOLO"] as const;
export type PermissionLevel = (typeof LEVELS)[number];

// Impact levels for command classification (separate from permission levels)
export const IMPACT_LEVELS = ["low", "medium", "high"] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

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

// Impact level ordering for comparison
export const IMPACT_LEVEL_ORDER = {
	low: 0,
	medium: 1,
	high: 2,
} satisfies Record<ImpactLevel, number>;

export const DEFAULT_LEVEL: PermissionLevel = "medium";

export function isImpactAtMost(level: ImpactLevel, threshold: ImpactLevel): boolean {
	return IMPACT_LEVEL_ORDER[level] <= IMPACT_LEVEL_ORDER[threshold];
}

export function maxImpactLevel(base: ImpactLevel, candidate: ImpactLevel): ImpactLevel {
	return IMPACT_LEVEL_ORDER[candidate] > IMPACT_LEVEL_ORDER[base] ? candidate : base;
}

export function isImpactLevel(value: unknown): value is ImpactLevel {
	return typeof value === "string" && (IMPACT_LEVELS as readonly string[]).includes(value);
}

export function isPermissionLevel(value: unknown): value is PermissionLevel {
	return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

export function cycleLevel(level: PermissionLevel): PermissionLevel {
	const index = LEVELS.indexOf(level);
	return LEVELS[(index + 1) % LEVELS.length];
}
