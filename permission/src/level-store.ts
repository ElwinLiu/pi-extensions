import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { PERMISSION_LEVEL_ENTRY_TYPE, PERMISSION_LEVEL_FLAG } from "./constants.js";
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

function parseSavedPermissionLevelEntry(entry: unknown): PermissionLevel | undefined {
	if (!entry || typeof entry !== "object") return undefined;

	const record = entry as {
		type?: unknown;
		customType?: unknown;
		data?: unknown;
	};

	if (record.type !== "custom") return undefined;
	if (record.customType !== PERMISSION_LEVEL_ENTRY_TYPE) return undefined;
	if (!record.data || typeof record.data !== "object") return undefined;

	const data = record.data as { level?: unknown };
	return normalizePermissionLevel(data.level);
}

function loadPermissionLevelFromSession(ctx: ExtensionContext): PermissionLevel | undefined {
	const entriesUnknown = ctx.sessionManager.getEntries() as unknown;
	if (!Array.isArray(entriesUnknown)) return undefined;

	for (let i = entriesUnknown.length - 1; i >= 0; i -= 1) {
		const level = parseSavedPermissionLevelEntry(entriesUnknown[i]);
		if (level) return level;
	}

	return undefined;
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
	 * Initializes the store from persisted session entries and CLI flags.
	 *
	 * Does not persist/notify (session start should be quiet).
	 */
	init(ctx: ExtensionContext): void {
		this.latestContext = ctx;

		const saved = loadPermissionLevelFromSession(ctx);
		if (saved) {
			this.level = saved;
		}

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
			this.pi.appendEntry(PERMISSION_LEVEL_ENTRY_TYPE, { level: nextLevel });
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
