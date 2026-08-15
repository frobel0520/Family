import { findProfileForStoredAuthor, type Profile } from "./profiles";

/**
 * 貼文的表情回應。存在 board.json 每則貼文的 `reactions` 陣列裡，不另開檔案。
 *
 * 規則跟 Facebook 一樣：一個人對一則貼文只會有一個表情，按同一個等於取消、按別的等於換掉。
 * 這讓資料只需要「一人一列」，也不用擔心有人連按十個表情洗版。
 */

/**
 * 快捷列的表情與**顯示排序**。2026-08-15 起表情不再限這五個（前端改用完整的
 * emoji 面板），這份清單只決定「常用的排前面」，不在清單裡的照樣可以按。
 */
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🙏"] as const;

/** 任何單一 emoji 都可以，不再是白名單。 */
export type ReactionEmoji = string;

/**
 * 單一 emoji 的驗證。優先用 `\p{RGI_Emoji}`（ES2024 的 v flag，能正確吃下
 * 國旗、膚色、家庭這種多碼位組合）；執行環境不支援時退回較寬鬆的樣式。
 * 重點是擋掉「一整串文字」被當成表情存進 board.json，不是要精挑細選哪些能按。
 */
const RGI_EMOJI = (() => {
	try {
		return new RegExp("^\\p{RGI_Emoji}$", "v");
	} catch {
		return null;
	}
})();

const EMOJI_FALLBACK =
	/^[\p{Extended_Pictographic}\p{Emoji_Presentation}](️|⃣|\p{Emoji_Modifier}|‍[\p{Extended_Pictographic}\p{Emoji_Presentation}])*$/u;

/** 最長的 RGI 序列（家庭 emoji）約 11 個碼位，抓 40 當上限綽綽有餘。 */
const MAX_EMOJI_LENGTH = 40;

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
	if (typeof value !== "string" || value.length === 0 || value.length > MAX_EMOJI_LENGTH) return false;
	return RGI_EMOJI ? RGI_EMOJI.test(value) : EMOJI_FALLBACK.test(value);
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
