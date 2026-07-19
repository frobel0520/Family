import { describe, it, expect } from "vitest";
import { encryptPayload, base64UrlToBytes, bytesToBase64Url } from "../src/web-push";

/**
 * RFC 8291 附錄 A 的官方測試向量：
 * 用固定的金鑰與 salt 加密固定明文，輸出必須和 RFC 給的 bytes 一模一樣。
 */
describe("Web Push encryption (RFC 8291 Appendix A test vector)", () => {
	it("produces the exact ciphertext from the RFC", async () => {
		const plaintext = "When I grow up, I want to be a watermelon";
		const uaPublic = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
		const authSecret = "BTBZMqHH6r4Tts7J_aSIgg";
		const asPublic = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
		const asPrivate = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
		const salt = "DGv6ra1nlYgDCS1FRnbzlw";
		const expected =
			"DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

		// 用 RFC 的 as 金鑰組出 CryptoKeyPair（x/y 從未壓縮公鑰的 raw bytes 切出來）
		const asPublicBytes = base64UrlToBytes(asPublic);
		const x = bytesToBase64Url(asPublicBytes.slice(1, 33));
		const y = bytesToBase64Url(asPublicBytes.slice(33, 65));
		const privateKey = await crypto.subtle.importKey(
			"jwk",
			{ kty: "EC", crv: "P-256", x, y, d: asPrivate },
			{ name: "ECDH", namedCurve: "P-256" },
			true,
			["deriveBits"],
		);
		const publicKey = await crypto.subtle.importKey(
			"raw",
			asPublicBytes as BufferSource,
			{ name: "ECDH", namedCurve: "P-256" },
			true,
			[],
		);

		const output = await encryptPayload(uaPublic, authSecret, new TextEncoder().encode(plaintext), {
			asKeyPair: { privateKey, publicKey },
			salt: base64UrlToBytes(salt),
		});

		expect(bytesToBase64Url(output)).toBe(expected);
	});
});
