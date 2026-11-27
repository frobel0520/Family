/**
 * Shared backend validator for base64-encoded image uploads (board, recipes, profile avatars).
 * Enforces decoded byte size limits BEFORE full allocation and verifies JPEG / PNG / WebP magic bytes.
 */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB (frontend resizes photos to <= 1280px / 1600px JPEG @ 0.85)
export const MAX_AVATAR_BYTES = 512 * 1024; // 512 KB (frontend resizes avatars to 256x256 JPEG @ 0.85)

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export type AllowedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export class ImageUploadError extends Error {
	constructor(
		message: string,
		public readonly status: number = 400,
	) {
		super(message);
	}
}

export interface ValidatedBase64Image {
	readonly base64: string;
	readonly mimeType: AllowedImageMimeType;
	readonly byteLength: number;
}

function detectImageMimeType(bytes: Uint8Array): AllowedImageMimeType | null {
	// JPEG: FF D8 FF
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "image/jpeg";
	}
	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return "image/png";
	}
	// WebP: "RIFF" <4-byte size> "WEBP"
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return "image/webp";
	}
	return null;
}

export function validateBase64Image(
	rawInput: string,
	maxBytes: number = MAX_IMAGE_BYTES,
): ValidatedBase64Image {
	const stripped = rawInput.replace(/^data:[^;,]*;base64,/i, "").replace(/\s+/g, "");
	if (!stripped || stripped.length % 4 !== 0 || !BASE64_PATTERN.test(stripped)) {
		throw new ImageUploadError("Invalid base64 image payload", 400);
	}

	const padding = stripped.endsWith("==") ? 2 : stripped.endsWith("=") ? 1 : 0;
	const estimatedBytes = (stripped.length * 3) / 4 - padding;
	if (estimatedBytes <= 0) {
		throw new ImageUploadError("Empty image payload", 400);
	}
	if (estimatedBytes > maxBytes) {
		const maxKb = Math.round(maxBytes / 1024);
		throw new ImageUploadError(`圖片檔案過大（上限 ${maxKb} KB）`, 413);
	}

	let binary: string;
	try {
		binary = atob(stripped);
	} catch {
		throw new ImageUploadError("Invalid base64 image encoding", 400);
	}

	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}

	if (bytes.byteLength > maxBytes) {
		const maxKb = Math.round(maxBytes / 1024);
		throw new ImageUploadError(`圖片檔案過大（上限 ${maxKb} KB）`, 413);
	}

	const mimeType = detectImageMimeType(bytes);
	if (!mimeType) {
		throw new ImageUploadError("只支援 JPEG、PNG 或 WebP 圖片格式", 400);
	}

	return { base64: stripped, mimeType, byteLength: bytes.byteLength };
}
