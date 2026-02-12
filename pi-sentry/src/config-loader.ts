import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_LEVEL, isPermissionLevel } from "./types.js";
import type { PermissionLevel } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageDefaultConfigPath = join(__dirname, "..", "config.default.json");
const legacyPackageUserConfigPath = join(__dirname, "..", "config.json");

const globalConfigPath = join(homedir(), ".pi", "agent", "pi-sentry", "config.json");

function getProjectConfigPath(cwd = process.cwd()): string {
	return resolve(cwd, ".pi", "pi-sentry", "config.json");
}

export interface Config {
	cycle_shortcut: string;
	level: PermissionLevel;
}

type RawConfig = {
	cycle_shortcut?: unknown;
	// Backward compatibility for older typo in released config files.
	cycle_shorcut?: unknown;
	level?: unknown;
};

const DEFAULT_CONFIG: Config = {
	cycle_shortcut: "shift+tab",
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

function getShortcut(raw: RawConfig): string | undefined {
	if (typeof raw.cycle_shortcut === "string") return raw.cycle_shortcut;
	if (typeof raw.cycle_shorcut === "string") return raw.cycle_shorcut;
	return undefined;
}

function normalizeConfig(raw: RawConfig): Config {
	const level = isPermissionLevel(raw.level) ? raw.level : DEFAULT_LEVEL;
	const cycle_shortcut = getShortcut(raw) ?? DEFAULT_CONFIG.cycle_shortcut;
	return {
		cycle_shortcut,
		level,
	};
}

function loadUserOverrides(cwd = process.cwd()): RawConfig {
	const legacyOverrides = readJsonFile(legacyPackageUserConfigPath) as RawConfig;
	const globalOverrides = readJsonFile(globalConfigPath) as RawConfig;
	const projectOverrides = readJsonFile(getProjectConfigPath(cwd)) as RawConfig;
	return { ...legacyOverrides, ...globalOverrides, ...projectOverrides };
}

export function loadConfig(options?: { cwd?: string }): Config {
	const cwd = options?.cwd ?? process.cwd();
	const defaults = readJsonFile(packageDefaultConfigPath) as RawConfig;
	const userOverrides = loadUserOverrides(cwd);
	return normalizeConfig({ ...DEFAULT_CONFIG, ...defaults, ...userOverrides });
}

function ensureParentDir(path: string): void {
	const parent = dirname(path);
	if (existsSync(parent)) return;
	mkdirSync(parent, { recursive: true });
}

function writeGlobalOverrides(patch: RawConfig): boolean {
	try {
		const globalOverrides = readJsonFile(globalConfigPath) as RawConfig;
		const next: RawConfig = { ...globalOverrides, ...patch };
		ensureParentDir(globalConfigPath);
		writeFileSync(globalConfigPath, `${JSON.stringify(next, null, "\t")}\n`, "utf-8");
		return true;
	} catch {
		return false;
	}
}

export function savePermissionLevel(level: PermissionLevel): boolean {
	if (!isPermissionLevel(level)) return false;
	return writeGlobalOverrides({ level });
}

export function saveCycleShortcut(shortcut: string): boolean {
	if (typeof shortcut !== "string" || shortcut.trim().length === 0) return false;
	return writeGlobalOverrides({ cycle_shortcut: shortcut.trim() });
}

export function getGlobalConfigPath(): string {
	return globalConfigPath;
}

export function getProjectConfigPathForDisplay(cwd = process.cwd()): string {
	return getProjectConfigPath(cwd);
}
