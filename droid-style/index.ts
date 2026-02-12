import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { BoxEditor } from "./editor/box-editor.js";
import { installAssistantMessagePrefix } from "./messages/assistant-prefix.js";
import { installUserMessagePrefix } from "./messages/user-prefix.js";
import { installCompactToolSpacing } from "./tool-tags/compact-tool-spacing.js";
import { registerToolCallTags } from "./tool-tags/register-tool-call-tags.js";

export default function (pi: ExtensionAPI) {
	installCompactToolSpacing();

	pi.on("session_start", (_event, ctx) => {
		registerToolCallTags(pi);
		installAssistantMessagePrefix(ctx.ui.theme);
		installUserMessagePrefix(ctx.ui.theme);

		ctx.ui.setEditorComponent((tui, theme, kb) => {
			return new BoxEditor(tui, theme, kb, ctx.ui.theme ?? theme);
		});
	});
}
