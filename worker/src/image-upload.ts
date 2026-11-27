/**
 * Shared backend validator & metadata sanitizer for base64-encoded image uploads
 * (board, recipes, profile avatars). Enforces decoded byte size limits BEFORE full
 * allocation, verifies JPEG / PNG / WebP magic bytes, and losslessly strips privacy-sensitive
 * EXIF / XMP / IPTC / text comment metadata segments (such as GPS coordinates and camera IDs).
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

function bytesToBase64(bytes: Uint8Array): string {
	const CHUNK = 0x8000;
	const parts: string[] = [];
	for (let i = 0; i < bytes.length; i += CHUNK) {
		parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
	}
	return btoa(parts.join(""));
}

/**
 * Losslessly strips EXIF/XMP (APP1), PictureInfo (APP12), Photoshop IPTC (APP13),
 * and Comment (COM) segments from a JPEG while preserving APP0 (JFIF), APP2 (ICC),
 * APP14 (Adobe color), and all quantization/Huffman/scan pixel data.
 */
function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;

	const kept: Uint8Array[] = [bytes.subarray(0, 2)];
	let strippedAny = false;
	let pos = 2;

	while (pos < bytes.length) {
		if (bytes[pos] !== 0xff) {
			return bytes;
		}
		const markerStart = pos;
		while (pos < bytes.length && bytes[pos] === 0xff) pos++;
		if (pos >= bytes.length) break;

		const marker = bytes[pos++];
		// Standalone markers without length payload (TEM, RST0-RST7, SOI, EOI)
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
			kept.push(bytes.subarray(markerStart, pos));
			if (marker === 0xd9) break;
			continue;
		}
		if (pos + 2 > bytes.length) return bytes;
		const segLen = (bytes[pos] << 8) | bytes[pos + 1];
		if (segLen < 2 || pos + segLen > bytes.length) return bytes;
		const segEnd = pos + segLen;

		if (marker === 0xda) {
			// Start of Scan: keep SOS header + entropy-coded data up to next real marker
			let scanEnd = segEnd;
			while (scanEnd < bytes.length) {
				if (bytes[scanEnd] !== 0xff) {
					scanEnd++;
					continue;
				}
				let ffEnd = scanEnd;
				while (ffEnd < bytes.length && bytes[ffEnd] === 0xff) ffEnd++;
				if (ffEnd >= bytes.length) {
					scanEnd = bytes.length;
					break;
				}
				const nextMarker = bytes[ffEnd];
				// 0x00 is stuffed 0xFF; 0xD0..0xD7 are restart markers inside entropy stream
				if (nextMarker === 0x00 || (nextMarker >= 0xd0 && nextMarker <= 0xd7)) {
					scanEnd = ffEnd + 1;
					continue;
				}
				break;
			}
			kept.push(bytes.subarray(markerStart, scanEnd));
			pos = scanEnd;
			continue;
		}

		// Drop APP1 (EXIF/XMP), APP3..APP13 (vendor/IPTC), APP15, and COM (0xFE)
		const shouldDrop =
			marker === 0xe1 ||
			(marker >= 0xe3 && marker <= 0xed) ||
			marker === 0xef ||
			marker === 0xfe;

		if (shouldDrop) {
			strippedAny = true;
		} else {
			kept.push(bytes.subarray(markerStart, segEnd));
		}
		pos = segEnd;
	}

	if (!strippedAny) return bytes;
	const total = kept.reduce((sum, part) => sum + part.byteLength, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of kept) {
		out.set(part, offset);
		offset += part.byteLength;
	}
	return out;
}

const DROPPED_PNG_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPngMetadata(bytes: Uint8Array): Uint8Array {
	if (bytes.length < 8) return bytes;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const kept: Uint8Array[] = [bytes.subarray(0, 8)];
	let strippedAny = false;
	let pos = 8;

	while (pos + 12 <= bytes.length) {
		const dataLen = view.getUint32(pos, false);
		const chunkEnd = pos + 12 + dataLen;
		if (chunkEnd > bytes.length) return bytes;
		const type = String.fromCharCode(
			bytes[pos + 4],
			bytes[pos + 5],
			bytes[pos + 6],
			bytes[pos + 7],
		);
		if (DROPPED_PNG_CHUNKS.has(type)) {
			strippedAny = true;
		} else {
			kept.push(bytes.subarray(pos, chunkEnd));
		}
		pos = chunkEnd;
		if (type === "IEND") break;
	}

	if (!strippedAny) return bytes;
	const total = kept.reduce((sum, part) => sum + part.byteLength, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of kept) {
		out.set(part, offset);
		offset += part.byteLength;
	}
	return out;
}

function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
	if (bytes.length < 12) return bytes;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const kept: Uint8Array[] = [];
	let strippedAny = false;
	let pos = 12;

	while (pos + 8 <= bytes.length) {
		const fourCC = String.fromCharCode(
			bytes[pos],
			bytes[pos + 1],
			bytes[pos + 2],
			bytes[pos + 3],
		);
		const chunkSize = view.getUint32(pos + 4, true);
		const paddedSize = chunkSize + (chunkSize & 1);
		const chunkEnd = pos + 8 + paddedSize;
		if (chunkEnd > bytes.length) return bytes;

		if (fourCC === "EXIF" || fourCC === "XMP ") {
			strippedAny = true;
		} else if (fourCC === "VP8X" && chunkSize >= 10) {
			const copy = bytes.slice(pos, chunkEnd);
			// Clear EXIF (bit 3 = 0x08) and XMP (bit 2 = 0x04) feature flags in VP8X
			copy[8] &= ~0x0c;
			kept.push(copy);
		} else {
			kept.push(bytes.subarray(pos, chunkEnd));
		}
		pos = chunkEnd;
	}

	if (!strippedAny) return bytes;
	const payloadBytes = kept.reduce((sum, part) => sum + part.byteLength, 0);
	const out = new Uint8Array(12 + payloadBytes);
	out.set(bytes.subarray(0, 12), 0);
	new DataView(out.buffer).setUint32(4, 4 + payloadBytes, true);
	let offset = 12;
	for (const part of kept) {
		out.set(part, offset);
		offset += part.byteLength;
	}
	return out;
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

	const sanitized =
		mimeType === "image/jpeg"
			? stripJpegMetadata(bytes)
			: mimeType === "image/png"
				? stripPngMetadata(bytes)
				: stripWebpMetadata(bytes);

	return {
		base64: sanitized === bytes ? stripped : bytesToBase64(sanitized),
		mimeType,
		byteLength: sanitized.byteLength,
	};
}
