import { describe, expect, it } from "vitest";
import { isReactionEmoji, summarizeReactions, toggleReaction, type StoredReaction } from "../src/reactions";
import type { Profile } from "../src/profiles";

const me = { email: "Yu@Example.com", name: "瑜ㄐ" };
const hers: StoredReaction = { emoji: "❤️", email: "chien@example.com", name: "茜茜", createdAt: "2026-08-14" };

describe("isReactionEmoji（2026-08-15 起改成「任何單一 emoji」，不再是白名單）", () => {
	it("收下各種單一 emoji，包含膚色、ZWJ 組合、國旗、數字鍵盤", () => {
		for (const emoji of ["👍", "❤️", "🥰", "👍🏽", "👨‍👩‍👧‍👦", "🇹🇼", "1️⃣", "🫶"]) {
			expect([emoji, isReactionEmoji(emoji)]).toEqual([emoji, true]);
		}
	});

	it("擋掉文字、多個表情、空字串與超長字串", () => {
		for (const bad of ["", "讚", "a", "👍👍", "👍 ", "x".repeat(50), 123, null, undefined]) {
			expect([String(bad), isReactionEmoji(bad)]).toEqual([String(bad), false]);
		}
	});
});

describe("toggleReaction", () => {
	it("一人一則貼文只留一個表情：按別的會換掉，不是加一個", () => {
		const first = toggleReaction([hers], "👍", me);
		const second = toggleReaction(first, "😂", me);
		expect(second.filter((r) => r.email === "yu@example.com")).toHaveLength(1);
		expect(second.find((r) => r.email === "yu@example.com")?.emoji).toBe("😂");
		expect(second).toContainEqual(hers); // 別人的不受影響
	});

	it("按同一個表情第二次等於取消", () => {
		const added = toggleReaction([], "👍", me);
		expect(toggleReaction(added, "👍", me)).toEqual([]);
	});
});

describe("summarizeReactions", () => {
	const profiles: Profile[] = [{ email: "yu@example.com", nickname: "小瑜", updatedAt: "2026-08-14" }];

	it("依固定順序彙總，並用現在的暱稱覆蓋存檔裡的名字快照", () => {
		const stored = [hers, ...toggleReaction([], "👍", me)];
		const summary = summarizeReactions(stored, profiles, "yu@example.com");
		expect(summary.map((r) => r.emoji)).toEqual(["👍", "❤️"]); // 存檔順序是 ❤️ 在前
		expect(summary[0]).toMatchObject({ count: 1, names: ["小瑜"], mine: true });
		expect(summary[1]).toMatchObject({ count: 1, names: ["茜茜"], mine: false });
	});

	it("沒有 reactions 欄位的舊貼文回空陣列", () => {
		expect(summarizeReactions(undefined, profiles, "yu@example.com")).toEqual([]);
	});
});
