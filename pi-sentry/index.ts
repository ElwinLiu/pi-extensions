import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerPermissionSystem } from "./src/permissions.js";

export default function (pi: ExtensionAPI) {
	registerPermissionSystem(pi);
}
