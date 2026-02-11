import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { BoxEditor } from "./editor/box-editor.js";
import { installUserMessagePrefix } from "./messages/user-prefix.js";
import { registerToolCallTags } from "./tool-call-tags.js";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		registerToolCallTags(pi);
		installUserMessagePrefix(ctx.ui.theme);

		ctx.ui.setEditorComponent((tui, theme, kb) => {
			return new BoxEditor(tui, theme, kb, ctx.ui.theme ?? theme);
		});
	});
}
