// Shared ANSI helpers for the droid-style extension

// Strip ANSI escape codes
export function stripAnsi(str: string): string {
	return str
		.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
		.replace(/\x1b\]8;;[^\x07]*\x07/g, "")
		.replace(/\x1b_[^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
}
