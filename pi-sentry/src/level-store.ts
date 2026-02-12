import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { PERMISSION_LEVEL_FLAG } from "./constants.js";
import { getGlobalConfigPath, loadConfig, savePermissionLevel } from "./config-loader.js";
import { cycleLevel, DEFAULT_LEVEL, isPermissionLevel } from "./types.js";
import type { PermissionLevel } from "./types.js";
import { renderPermissionWidget } from "./ui.js";

export type SetPermissionLevelOptions = {
	persist?: boolean;
	notify?: boolean;
};

function normalizePermissionLevel(value: unknown): PermissionLevel | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().toLowerCase();
	return isPermissionLevel(normalized) ? normalized : undefined;
}

function parsePermissionLevelFlag(pi: ExtensionAPI): PermissionLevel | undefined {
	return (
		normalizePermissionLevel(pi.getFlag(PERMISSION_LEVEL_FLAG)) ??
		normalizePermissionLevel(pi.getFlag(`--${PERMISSION_LEVEL_FLAG}`))
	);
}

export class PermissionLevelStore {
	private level: PermissionLevel = DEFAULT_LEVEL;
	private latestContext: ExtensionContext | undefined;

	constructor(private readonly pi: ExtensionAPI) {}

	get current(): PermissionLevel {
		return this.level;
	}

	setLatestContext(ctx: ExtensionContext): void {
		this.latestContext = ctx;
	}

	/**
	 * Initializes the store from config and CLI flags.
	 *
	 * Does not persist/notify (session start should be quiet).
	 */
	init(ctx: ExtensionContext): void {
		this.latestContext = ctx;

		const config = loadConfig({ cwd: ctx.cwd });
		this.level = config.level;

		const fromFlag = parsePermissionLevelFlag(this.pi);
		if (fromFlag) {
			this.level = fromFlag;
		}

		renderPermissionWidget(ctx, this.level);
	}

	set(nextLevel: PermissionLevel, ctx: ExtensionContext, options?: SetPermissionLevelOptions): void {
		const changed = this.level !== nextLevel;

		this.level = nextLevel;
		this.latestContext = ctx;

		if (changed && options?.persist !== false) {
			const persisted = savePermissionLevel(nextLevel);
			if (!persisted) {
				ctx.ui.notify(`Failed to persist permission level to ${getGlobalConfigPath()}`, "error");
			}
		}

		renderPermissionWidget(ctx, nextLevel);

		if (options?.notify !== false) {
			ctx.ui.notify(`Permission level: ${nextLevel.toUpperCase()}`, "info");
		}
	}

	cycle(options?: SetPermissionLevelOptions): void {
		if (!this.latestContext) return;
		this.set(cycleLevel(this.level), this.latestContext, { notify: false, ...options });
	}
}
