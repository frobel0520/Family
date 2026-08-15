import { lazy, Suspense, useState } from "react";
import type { ReactionSummary } from "../types";

/**
 * 快捷列的表情與**顯示排序**，跟 Worker 的 REACTION_EMOJIS 一致。
 * 2026-08-15 起可以按的表情不限這五個（「更多」會打開完整面板），這裡只是常用的排前面。
 */
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🙏"];

// 完整表情面板連同 400KB 表情資料都是點開才載入，不進主 bundle
const EmojiPicker = lazy(() =>
	import("./EmojiPicker").then((module) => ({ default: module.EmojiPicker })),
);

/** 排序：快捷列的五個照原順序排前面，其他表情照先後順序排在後面。 */
function emojiOrder(emoji: string): number {
	const index = REACTION_EMOJIS.indexOf(emoji);
	return index === -1 ? REACTION_EMOJIS.length : index;
}

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

	return next.sort((a, b) => emojiOrder(a.emoji) - emojiOrder(b.emoji));
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
	const [fullPickerOpen, setFullPickerOpen] = useState(false);
	const mine = reactions.find((r) => r.mine)?.emoji;

	function pick(emoji: string) {
		setPickerOpen(false);
		setFullPickerOpen(false);
		onToggle(emoji);
	}

	function toggleQuickRow() {
		setFullPickerOpen(false);
		setPickerOpen((open) => !open);
	}

	return (
		<div className="reactions">
			<button
				type="button"
				className={`reaction-add${pickerOpen ? " open" : ""}`}
				aria-label={mine ? "換一個表情" : "加上表情"}
				aria-expanded={pickerOpen || fullPickerOpen}
				disabled={busy}
				onClick={toggleQuickRow}
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
					{/* 常用的五個不夠用時，才載入完整表情面板 */}
					<button
						type="button"
						className="reaction-picker-more"
						aria-label="更多表情"
						onClick={() => {
							setPickerOpen(false);
							setFullPickerOpen(true);
						}}
					>
						⋯
					</button>
				</div>
			)}

			{fullPickerOpen && (
				<div className="reaction-full-picker">
					<Suspense fallback={<p className="hint">表情載入中…</p>}>
						<EmojiPicker onPick={pick} />
					</Suspense>
					<button type="button" className="reaction-full-picker-close" onClick={() => setFullPickerOpen(false)}>
						關閉
					</button>
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
