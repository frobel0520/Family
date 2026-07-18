/**
 * UTF-8 safe base64 helpers. Plain atob/btoa only handle Latin1, which breaks
 * on Chinese dish names etc. — this repo's data files are full of those.
 */

export function encodeBase64Utf8(str: string): string {
	const bytes = new TextEncoder().encode(str);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export function decodeBase64Utf8(base64: string): string {
	const binary = atob(base64.replace(/\n/g, ""));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}
