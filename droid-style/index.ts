import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { BoxEditor } from "./editor/box-editor.js";
import { installUserMessagePrefix } from "./messages/user-prefix.js";
import { badge, registerToolCallTags } from "./tool-call-tags.js";

const UI_BADGE_RENDER_EVENT = "ui:badge:render" as const;

type UiBadgeRenderRequest = {
	label: string;
	theme: unknown;
	respond: (value: string) => void;
};

function isBadgeRenderRequest(value: unknown): value is UiBadgeRenderRequest {
	if (!value || typeof value !== "object") return false;
	const record = value as Partial<UiBadgeRenderRequest>;
	return typeof record.label === "string" && typeof record.respond === "function";
}

export default function (pi: ExtensionAPI) {
	registerToolCallTags(pi);

	pi.events.on(UI_BADGE_RENDER_EVENT, (payload) => {
		if (!isBadgeRenderRequest(payload)) return;
		payload.respond(badge(payload.theme as any, payload.label));
	});

	pi.on("session_start", (_event, ctx) => {
		installUserMessagePrefix(ctx.ui.theme);

		setTimeout(() => {
			ctx.ui.setEditorComponent((tui, theme, kb) => {
				const activeTheme = ctx.ui.theme ?? theme;
				return new BoxEditor(tui, theme, kb, activeTheme);
			});
		}, 0);
	});
}
