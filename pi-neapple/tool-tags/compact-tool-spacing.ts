import { ToolExecutionComponent } from "@mariozechner/pi-coding-agent";

const PATCH_FLAG = "__droidStyleCompactToolSpacingPatched__";

/**
 * Make tool blocks compact by removing Box/Text vertical padding.
 *
 * Default layout stack for each tool call:
 * - leading Spacer(1)
 * - content Box/Text with paddingY=1 (top + bottom)
 *
 * That creates 3 blank lines between consecutive tool calls.
 * We keep the leading spacer (1 line) and remove vertical padding.
 */
export function installCompactToolSpacing(): void {
	const globalState = globalThis as Record<string, unknown>;
	if (globalState[PATCH_FLAG]) return;
	globalState[PATCH_FLAG] = true;

	const proto = ToolExecutionComponent.prototype as any;
	if (!proto || typeof proto.updateDisplay !== "function") return;

	const baseUpdateDisplay = proto.updateDisplay;
	proto.updateDisplay = function patchedUpdateDisplay(this: any, ...args: any[]) {
		if (this?.contentBox && typeof this.contentBox.paddingY === "number") {
			this.contentBox.paddingY = 0;
		}
		if (this?.contentText && typeof this.contentText.paddingY === "number") {
			this.contentText.paddingY = 0;
		}
		return baseUpdateDisplay.apply(this, args);
	};
}
