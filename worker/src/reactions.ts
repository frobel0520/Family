import { findProfileForStoredAuthor, type Profile } from "./profiles";

/**
 * 貼文的表情回應。存在 board.json 每則貼文的 `reactions` 陣列裡，不另開檔案。
 *
 * 規則跟 Facebook 一樣：一個人對一則貼文只會有一個表情，按同一個等於取消、按別的等於換掉。
 * 這讓資料只需要「一人一列」，也不用擔心有人連按十個表情洗版。
 */

/** 可選的表情與顯示順序（前端的按鈕列與後端驗證共用同一份定義）。 */
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🙏"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface StoredReaction {
	emoji: string;
	email: string; // 小寫，一人一列的主鍵
	name: string; // 當下的顯示名快照；讀取時若找得到 profile 會用現在的暱稱覆蓋
	createdAt: string;
}

/** 回前端的彙總：誰按了什麼、我自己按的是哪一個。存檔用的 email 不外流。 */
export interface ReactionSummary {
	emoji: string;
	count: number;
	names: string[]; // 給前端做「👍 瑜ㄐ、茜茜」這種提示
	mine: boolean;
}

export function isReactionEmoji(value: unknown): value is ReactionEmoji {
	return typeof value === "string" && (REACTION_EMOJIS as readonly string[]).includes(value);
}

/** 按下表情：同一個再按一次是取消，按別的是換掉（一人只留一列）。 */
export function toggleReaction(
	reactions: StoredReaction[],
	emoji: ReactionEmoji,
	user: { email: string; name: string },
): StoredReaction[] {
	const email = user.email.toLowerCase();
	const mine = reactions.find((r) => r.email === email);
	const others = reactions.filter((r) => r.email !== email);
	if (mine?.emoji === emoji) return others;
	return [...others, { emoji, email, name: user.name, createdAt: new Date().toISOString() }];
}

/**
 * 依 REACTION_EMOJIS 的順序彙總，並用目前的 profile 暱稱覆蓋當年的名字快照
 * （跟頭像同一個教訓：存檔裡的身分快照會過時，顯示時才解析）。
 */
export function summarizeReactions(
	reactions: StoredReaction[] | undefined,
	profiles: Profile[],
	viewerEmail?: string,
): ReactionSummary[] {
	const viewer = viewerEmail?.toLowerCase();
	const byEmoji = new Map<string, StoredReaction[]>();
	for (const reaction of reactions ?? []) {
		const list = byEmoji.get(reaction.emoji);
		if (list) list.push(reaction);
		else byEmoji.set(reaction.emoji, [reaction]);
	}

	const order = (emoji: string) => {
		const index = (REACTION_EMOJIS as readonly string[]).indexOf(emoji);
		return index === -1 ? REACTION_EMOJIS.length : index; // 未知表情（舊資料）排最後
	};

	return [...byEmoji.entries()]
		.sort(([a], [b]) => order(a) - order(b))
		.map(([emoji, list]) => ({
			emoji,
			count: list.length,
			names: list.map((r) => findProfileForStoredAuthor(profiles, r.email, r.name)?.nickname?.trim() || r.name),
			mine: list.some((r) => r.email === viewer),
		}));
}
