import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultConfigPath = join(__dirname, "..", "config.default.json");
const userConfigPath = join(__dirname, "..", "config.json");

export interface Config {
	shortcut: string;
	description: string;
}

const DEFAULT_CONFIG: Config = {
	shortcut: "shift+tab",
	description: "Cycle through permission levels",
};

export function loadConfig(): Config {
	let config: Config = { ...DEFAULT_CONFIG };

	// Merge defaults from config.default.json
	try {
		const defaultsContent = readFileSync(defaultConfigPath, "utf-8");
		const defaults = JSON.parse(defaultsContent) as Partial<Config>;
		config = { ...config, ...defaults };
	} catch {
		// Use hardcoded defaults if file doesn't exist or is invalid
	}

	// Merge user overrides from config.json
	try {
		const userContent = readFileSync(userConfigPath, "utf-8");
		const userOverrides = JSON.parse(userContent) as Partial<Config>;
		config = { ...config, ...userOverrides };
	} catch {
		// No user config or invalid - use defaults
	}

	return config;
}
