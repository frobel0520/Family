/** 貼文/留言/點菜共用的時間格式（例：2026/7/25 下午4:20）。 */
export function formatTime(iso: string): string {
	return new Date(iso).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" });
}
