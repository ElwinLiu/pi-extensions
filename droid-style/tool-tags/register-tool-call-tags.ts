import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerBashTool } from "./bash.js";
import { registerEditTool } from "./edit.js";
import { registerFindTool } from "./find.js";
import { registerGrepTool } from "./grep.js";
import { registerLsTool } from "./ls.js";
import { registerReadTool } from "./read.js";
import { registerWriteTool } from "./write.js";

export function registerToolCallTags(pi: ExtensionAPI): void {
	registerReadTool(pi);
	registerWriteTool(pi);
	registerEditTool(pi);
	registerLsTool(pi);
	registerFindTool(pi);
	registerGrepTool(pi);
	registerBashTool(pi);
}
