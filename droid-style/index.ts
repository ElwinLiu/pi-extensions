import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { BoxEditor } from "./editor/box-editor.js";
import { registerToolCallTags } from "./tool-call-tags.js";

export default function (pi: ExtensionAPI) {
	registerToolCallTags(pi);

	pi.on("session_start", (_event, ctx) => {
		setTimeout(() => {
			ctx.ui.setEditorComponent((tui, theme, kb) => {
				const activeTheme = ctx.ui.theme ?? theme;
				return new BoxEditor(tui, theme, kb, activeTheme);
			});
		}, 0);
	});
}
