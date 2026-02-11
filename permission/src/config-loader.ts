import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_LEVEL, isPermissionLevel } from "./types.js";
import type { PermissionLevel } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultConfigPath = join(__dirname, "..", "config.default.json");
const userConfigPath = join(__dirname, "..", "config.json");

export interface Config {
	cycle_shorcut: string;
	level: PermissionLevel;
}

const DEFAULT_CONFIG: Config = {
	cycle_shorcut: "shift+tab",
	level: DEFAULT_LEVEL,
};

function readJsonFile(path: string): Record<string, unknown> {
	try {
		const content = readFileSync(path, "utf-8");
		const parsed = JSON.parse(content) as unknown;
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function normalizeConfig(raw: Partial<Config>): Config {
	const level = isPermissionLevel(raw.level) ? raw.level : DEFAULT_LEVEL;
	const cycle_shorcut =
		typeof raw.cycle_shorcut === "string" ? raw.cycle_shorcut : DEFAULT_CONFIG.cycle_shorcut;
	return {
		cycle_shorcut,
		level,
	};
}

function loadUserOverrides(): Partial<Config> {
	return readJsonFile(userConfigPath) as Partial<Config>;
}

export function loadConfig(): Config {
	const defaults = readJsonFile(defaultConfigPath) as Partial<Config>;
	const userOverrides = loadUserOverrides();
	return normalizeConfig({ ...DEFAULT_CONFIG, ...defaults, ...userOverrides });
}

export function savePermissionLevel(level: PermissionLevel): boolean {
	if (!isPermissionLevel(level)) return false;

	try {
		const userOverrides = loadUserOverrides();
		const next = { ...userOverrides, level };
		writeFileSync(userConfigPath, `${JSON.stringify(next, null, "\t")}\n`, "utf-8");
		return true;
	} catch {
		return false;
	}
}
