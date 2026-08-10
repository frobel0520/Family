import { describe, expect, it } from "vitest";
import { findProfileForStoredAuthor, type Profile } from "../src/profiles";

const profiles: Profile[] = [
	{ email: "yu@example.com", nickname: "瑜ㄐ", avatarPath: "images/avatars/yu.jpg", updatedAt: "2026-08-10" },
	{ email: "other@example.com", nickname: "其他人", updatedAt: "2026-08-10" },
];

describe("stored author profile lookup", () => {
	it("finds the current profile by email even when the historical name changed", () => {
		expect(findProfileForStoredAuthor(profiles, "YU@EXAMPLE.COM", "舊名字")?.nickname).toBe("瑜ㄐ");
	});

	it("falls back to a unique nickname for records created before authorEmail existed", () => {
		expect(findProfileForStoredAuthor(profiles, undefined, " 瑜ㄐ ")?.email).toBe("yu@example.com");
	});

	it("does not guess when a nickname is ambiguous", () => {
		const duplicate = { ...profiles[1], email: "duplicate@example.com", nickname: "瑜ㄐ" };
		expect(findProfileForStoredAuthor([...profiles, duplicate], undefined, "瑜ㄐ")).toBeNull();
	});
});
