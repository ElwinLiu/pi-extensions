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

		// Set the neapple theme by default to ensure compatibility.
		// The theme is registered via pi.themes in package.json when installed as a package.
		// For local development, install as a local path package instead of auto-discovery:
		//   pi install /path/to/pi-neapple
		const result = ctx.ui.setTheme("neapple");
		if (!result.success) {
			ctx.ui.notify(
				'Neapple theme not found. Install as a package: pi install /path/to/pi-neapple',
				"warning",
			);
		}

		installAssistantMessagePrefix(ctx.ui.theme);
		installUserMessagePrefix(ctx.ui.theme);

		ctx.ui.setEditorComponent((tui, theme, kb) => {
			return new BoxEditor(tui, theme, kb, ctx.ui.theme ?? theme);
		});
	});
}
