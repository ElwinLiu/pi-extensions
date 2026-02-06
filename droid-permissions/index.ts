import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerEditorShortcut } from "../droid-style/editor-shortcuts.js";
import { registerPermissionSystem } from "./permissions.js";

export default function (pi: ExtensionAPI) {
	const controller = registerPermissionSystem(pi);
	registerEditorShortcut("ctrl+l", controller.cyclePermission);

	pi.on("session_shutdown", () => {
		registerEditorShortcut("ctrl+l", undefined);
	});
}
