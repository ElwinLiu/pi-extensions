const editorShortcutHandlers = new Map<string, () => void>();

function normalizeShortcut(shortcut: string): string {
	return shortcut.trim().toLowerCase();
}

export function registerEditorShortcut(shortcut: string, handler: (() => void) | undefined): void {
	const key = normalizeShortcut(shortcut);
	if (!handler) {
		editorShortcutHandlers.delete(key);
		return;
	}
	editorShortcutHandlers.set(key, handler);
}

export function runEditorShortcut(shortcut: string): boolean {
	const handler = editorShortcutHandlers.get(normalizeShortcut(shortcut));
	if (!handler) return false;
	handler();
	return true;
}
