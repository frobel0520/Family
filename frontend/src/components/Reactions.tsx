import { useState } from "react";
import type { ReactionSummary } from "../types";

/** 可選的表情與顯示順序，跟 Worker 的 REACTION_EMOJIS 一致（後端也會驗證）。 */
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🙏"];

/**
 * 前端先自己算一次結果，按下去馬上有反應（一次寫入是一個 GitHub commit，等回應會有明顯延遲）。
 * 規則跟後端 toggleReaction 一樣；真正的結果還是以 API 回傳的為準，失敗就還原。
 */
export function applyLocalToggle(reactions: ReactionSummary[], emoji: string, myName: string): ReactionSummary[] {
	// 先把自己從原本按的那個拿掉（同名的人只拿掉一個，不要把同名的家人也刪掉）
	const dropOnce = (names: string[]) => {
		const index = names.indexOf(myName);
		return index === -1 ? names.slice(0, -1) : [...names.slice(0, index), ...names.slice(index + 1)];
	};
	const without = reactions
		.map((r) => (r.mine ? { ...r, count: r.count - 1, names: dropOnce(r.names), mine: false } : r))
		.filter((r) => r.count > 0);

	if (reactions.find((r) => r.mine)?.emoji === emoji) return without; // 按同一個 = 取消

	const existing = without.find((r) => r.emoji === emoji);
	const next = existing
		? without.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, names: [...r.names, myName], mine: true } : r))
		: [...without, { emoji, count: 1, names: [myName], mine: true }];

	return next.sort((a, b) => REACTION_EMOJIS.indexOf(a.emoji) - REACTION_EMOJIS.indexOf(b.emoji));
}

interface Props {
	reactions: ReactionSummary[];
	busy?: boolean;
	onToggle: (emoji: string) => void;
}

/**
 * 貼文底下那排表情回應。一個人一則貼文只會有一個表情（按同一個是取消、按別的是換掉），
 * 所以按鈕列打開後選完就收起來。
 */
export function Reactions({ reactions, busy, onToggle }: Props) {
	const [pickerOpen, setPickerOpen] = useState(false);
	const mine = reactions.find((r) => r.mine)?.emoji;

	function pick(emoji: string) {
		setPickerOpen(false);
		onToggle(emoji);
	}

	return (
		<div className="reactions">
			<button
				type="button"
				className={`reaction-add${pickerOpen ? " open" : ""}`}
				aria-label={mine ? "換一個表情" : "加上表情"}
				aria-expanded={pickerOpen}
				disabled={busy}
				onClick={() => setPickerOpen((open) => !open)}
			>
				{mine ?? "☺"}
				<span className="reaction-add-plus">＋</span>
			</button>

			{pickerOpen && (
				<div className="reaction-picker" role="group" aria-label="選一個表情">
					{REACTION_EMOJIS.map((emoji) => (
						<button
							key={emoji}
							type="button"
							className={`reaction-picker-btn${mine === emoji ? " mine" : ""}`}
							aria-label={emoji}
							onClick={() => pick(emoji)}
						>
							{emoji}
						</button>
					))}
				</div>
			)}

			{reactions.map((reaction) => (
				<button
					key={reaction.emoji}
					type="button"
					className={`reaction-chip${reaction.mine ? " mine" : ""}`}
					// 手機沒有 hover，所以名字也直接寫進 aria-label
					title={reaction.names.join("、")}
					aria-label={`${reaction.emoji} ${reaction.names.join("、")}`}
					disabled={busy}
					onClick={() => onToggle(reaction.emoji)}
				>
					<span className="reaction-chip-emoji">{reaction.emoji}</span>
					{reaction.count}
				</button>
			))}
		</div>
	);
}
