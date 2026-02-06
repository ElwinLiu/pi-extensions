import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerPermissionSystem } from "./permissions.js";

export default function (pi: ExtensionAPI) {
	registerPermissionSystem(pi);
}
