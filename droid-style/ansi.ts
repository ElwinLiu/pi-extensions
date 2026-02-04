// Shared ANSI helpers for the droid-style extension

// Strip ANSI escape codes
export function stripAnsi(str: string): string {
	return str
		.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
		.replace(/\x1b\]8;;[^\x07]*\x07/g, "")
		.replace(/\x1b_[^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
}

// ------------------------------------------------------------
// Color helpers (truecolor + 256color fallback)
// ------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const cleaned = hex.replace("#", "");
	const r = Number.parseInt(cleaned.slice(0, 2), 16);
	const g = Number.parseInt(cleaned.slice(2, 4), 16);
	const b = Number.parseInt(cleaned.slice(4, 6), 16);
	return { r, g, b };
}

const CUBE_VALUES = [0, 95, 135, 175, 215, 255];
const GRAY_VALUES = Array.from({ length: 24 }, (_, i) => 8 + i * 10);

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
	const dr = r1 - r2;
	const dg = g1 - g2;
	const db = b1 - b2;
	return dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
}

function findClosestCubeIndex(value: number): number {
	let minDist = Number.POSITIVE_INFINITY;
	let minIdx = 0;
	for (let i = 0; i < CUBE_VALUES.length; i++) {
		const dist = Math.abs(value - CUBE_VALUES[i]!);
		if (dist < minDist) {
			minDist = dist;
			minIdx = i;
		}
	}
	return minIdx;
}

function findClosestGrayIndex(gray: number): number {
	let minDist = Number.POSITIVE_INFINITY;
	let minIdx = 0;
	for (let i = 0; i < GRAY_VALUES.length; i++) {
		const dist = Math.abs(gray - GRAY_VALUES[i]!);
		if (dist < minDist) {
			minDist = dist;
			minIdx = i;
		}
	}
	return minIdx;
}

function rgbTo256(r: number, g: number, b: number): number {
	const rIdx = findClosestCubeIndex(r);
	const gIdx = findClosestCubeIndex(g);
	const bIdx = findClosestCubeIndex(b);
	const cubeR = CUBE_VALUES[rIdx]!;
	const cubeG = CUBE_VALUES[gIdx]!;
	const cubeB = CUBE_VALUES[bIdx]!;
	const cubeIndex = 16 + 36 * rIdx + 6 * gIdx + bIdx;
	const cubeDist = colorDistance(r, g, b, cubeR, cubeG, cubeB);

	const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
	const grayIdx = findClosestGrayIndex(gray);
	const grayValue = GRAY_VALUES[grayIdx]!;
	const grayIndex = 232 + grayIdx;
	const grayDist = colorDistance(r, g, b, grayValue, grayValue, grayValue);

	const spread = Math.max(r, g, b) - Math.min(r, g, b);
	if (spread < 10 && grayDist < cubeDist) {
		return grayIndex;
	}
	return cubeIndex;
}

export function fgHex(theme: any, hex: string, text: string): string {
	const { r, g, b } = hexToRgb(hex);
	const mode = typeof theme?.getColorMode === "function" ? theme.getColorMode() : "truecolor";
	if (mode === "256color") {
		const idx = rgbTo256(r, g, b);
		return `\x1b[38;5;${idx}m${text}\x1b[39m`;
	}
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}
