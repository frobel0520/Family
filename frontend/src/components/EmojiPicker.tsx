import { useEffect, useRef, useState } from "react";
// 表情資料自己託管（Vite 會把它當靜態資源打包），不打外部 CDN：
// 少一個線上依賴，也不會有第三方 CDN 掛掉就選不了表情的問題。
import emojiDataUrl from "emoji-picker-element-data/zh-hant/cldr/data.json?url";

/** 套件只內建簡體，這裡自己給一份繁體（純 UI 字串，資料本身是 zh-hant CLDR）。 */
const I18N_ZH_TW = {
	categoriesLabel: "分類",
	emojiUnsupportedMessage: "這個瀏覽器不支援彩色表情符號。",
	favoritesLabel: "常用",
	loadingMessage: "載入中…",
	networkErrorMessage: "表情符號載入失敗。",
	regionLabel: "表情符號選擇器",
	searchDescription: "有搜尋結果時，用上下鍵選擇、Enter 確認。",
	searchLabel: "搜尋",
	searchResultsLabel: "搜尋結果",
	skinToneDescription: "展開後用上下鍵選擇、Enter 確認。",
	skinToneLabel: "選擇膚色（目前是 {skinTone}）",
	skinTonesLabel: "膚色",
	skinTones: ["預設", "白皙", "淺色", "中等", "深色", "黝黑"],
	categories: {
		custom: "自訂",
		"smileys-emotion": "表情與情緒",
		"people-body": "人物與身體",
		"animals-nature": "動物與自然",
		"food-drink": "食物與飲料",
		"travel-places": "旅遊與地點",
		activities: "活動",
		objects: "物品",
		symbols: "符號",
		flags: "旗幟",
	},
};

/**
 * 藏掉套件內建的搜尋框。
 *
 * 原因：它的搜尋索引不切中文詞——實測 `getEmojiBySearchQuery("貓")` 回空陣列，
 * 只有拼音 shortcode（"xiao" → 😀😃…）搜得到。家人一定是打中文，留著只會讓人
 * 以為壞掉。分類瀏覽（跟訊息 App 一樣）不受影響，膚色選擇器也保留。
 * 只能注入 shadow DOM 的 style，因為套件沒有開「隱藏搜尋」的選項或 ::part。
 */
function hideSearchBox(element: HTMLElement) {
	const style = document.createElement("style");
	style.textContent = ".search-wrapper { display: none !important; }";
	element.shadowRoot?.appendChild(style);
}

interface Props {
	onPick: (emoji: string) => void;
}

/**
 * 完整的表情面板（`emoji-picker-element`，Web Component）。
 * **動態載入**：套件本身和 400KB 的表情資料只有在使用者真的點開面板時才下載，
 * 不會拖慢一般開 App 的速度（資料下載後由套件自己存進 IndexedDB，之後不再重抓）。
 */
export function EmojiPicker({ onPick }: Props) {
	const host = useRef<HTMLDivElement>(null);
	const [failed, setFailed] = useState(false);
	// 用 ref 拿最新的 onPick，effect 才不用因為 callback 換了就整個重建面板
	const onPickRef = useRef(onPick);
	onPickRef.current = onPick;

	useEffect(() => {
		let element: HTMLElement | null = null;
		let cancelled = false;

		const handleClick = (event: Event) => {
			const unicode = (event as CustomEvent<{ unicode?: string }>).detail?.unicode;
			if (unicode) onPickRef.current(unicode);
		};

		void import("emoji-picker-element/picker.js")
			.then(({ default: Picker }) => {
				if (cancelled || !host.current) return;
				element = new Picker({
					dataSource: emojiDataUrl,
					locale: "zh-hant",
					i18n: I18N_ZH_TW,
					// 固定支援到 Emoji 14.0（2021，iOS 15.4／Android 12 以上都認得），**刻意不用套件
					// 內建的自動偵測**：偵測是靠 canvas 量測字型，在某些環境（實測：本機驗證用的
					// 瀏覽器）會誤判成「完全不支援」，結果整個面板一個表情都不顯示。寧可少幾個
					// 2022 年後的新表情，也不要有人打開面板看到一片空白。
					emojiVersion: 14,
				}) as unknown as HTMLElement;
				element.addEventListener("emoji-click", handleClick);
				hideSearchBox(element);
				host.current.appendChild(element);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});

		return () => {
			cancelled = true;
			element?.removeEventListener("emoji-click", handleClick);
			element?.remove();
		};
	}, []);

	return (
		<div className="emoji-picker-host" ref={host}>
			{failed && <p className="error">表情符號載入失敗，請重新整理再試。</p>}
		</div>
	);
}
