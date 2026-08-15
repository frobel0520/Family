/**
 * 家庭行事曆的資料模型與純邏輯（存 data/events.json，跟佈告欄同一套 GitHub Contents API）。
 *
 * 時間一律當「台灣時間的牆上時間」存字串（`2026-08-20` / `09:00`），不存 UTC ISO：
 * 家人填的就是本地時間，存本地時間才不會因為 Worker 跑在哪個地區而位移，
 * 需要比較先後時才在這裡補上 +08:00 轉成 epoch。
 */

/** 台灣沒有日光節約時間，固定 offset 就夠用。 */
const TAIPEI_OFFSET = "+08:00";

export interface FamilyEvent {
	id: string;
	title: string;
	date: string; // YYYY-MM-DD（台灣時間）
	time?: string | null; // HH:mm；null/未填 = 整天活動
	note?: string;
	createdBy: string; // 建立者顯示名快照（顯示時會用現在的暱稱覆蓋）
	createdByEmail: string;
	createdAt: string; // UTC ISO
	updatedAt: string; // UTC ISO
	/** 要收到提醒的人（小寫 email）。空陣列 = 不提醒任何人。 */
	remindEmails: string[];
	/** 提醒時間，`YYYY-MM-DDTHH:mm`（台灣時間，由建立者自己指定）。null = 不提醒。 */
	remindAt?: string | null;
	/** 已送出提醒的時間（UTC ISO），防止 cron 每次掃描重複發。 */
	notifiedAt?: string | null;
}

export const MAX_TITLE_LENGTH = 60;
export const MAX_NOTE_LENGTH = 500;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const REMIND_AT_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/** 格式對，而且真的是存在的日期（擋掉 2026-02-31 這種）。 */
export function isValidDate(value: unknown): value is string {
	if (typeof value !== "string" || !DATE_RE.test(value)) return false;
	const parsed = new Date(`${value}T00:00${TAIPEI_OFFSET}`);
	return !Number.isNaN(parsed.getTime()) && toTaipeiDateString(parsed) === value;
}

export function isValidTime(value: unknown): value is string {
	return typeof value === "string" && TIME_RE.test(value);
}

export function isValidRemindAt(value: unknown): value is string {
	if (typeof value !== "string" || !REMIND_AT_RE.test(value)) return false;
	const [date] = value.split("T");
	return isValidDate(date);
}

/** 台灣時間的 YYYY-MM-DD（cron 在 UTC 上跑，不能直接用 toISOString）。 */
export function toTaipeiDateString(instant: Date): string {
	return new Date(instant.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 把存起來的台灣時間字串轉成 epoch 毫秒。 */
export function taipeiToEpochMs(date: string, time?: string | null): number {
	return new Date(`${date}T${time || "00:00"}${TAIPEI_OFFSET}`).getTime();
}

function remindEpochMs(event: FamilyEvent): number | null {
	if (!event.remindAt || !isValidRemindAt(event.remindAt)) return null;
	const [date, time] = event.remindAt.split("T");
	return taipeiToEpochMs(date, time);
}

/** 排序：日期 → 時間（整天活動排在當天最前面）。 */
export function compareEvents(a: FamilyEvent, b: FamilyEvent): number {
	return a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "");
}

/**
 * 該送出提醒的活動：時間到了、有指定對象、還沒送過。
 *
 * `graceMs` 是補送的上限（預設 24 小時）：cron 如果掛掉幾天沒跑，恢復後不該把一整週
 * 過期的提醒一次全部推出來吵人——超過這個範圍就直接視為過期，不補送。
 */
export function dueReminders(events: FamilyEvent[], nowMs: number, graceMs = 24 * 60 * 60 * 1000): FamilyEvent[] {
	return events.filter((event) => {
		if (event.notifiedAt) return false;
		if (!event.remindEmails?.length) return false;
		const at = remindEpochMs(event);
		return at !== null && at <= nowMs && nowMs - at <= graceMs;
	});
}

/** 通知內文：「8/20（四）09:00 家庭聚餐」這種一行摘要。 */
export function eventSummary(event: FamilyEvent): string {
	const [, month, day] = event.date.split("-");
	// 星期用「當成 UTC 午夜」算，才不會被時區位移到前一天
	const weekday = "日一二三四五六"[new Date(`${event.date}T00:00Z`).getUTCDay()] ?? "";
	const time = event.time ? ` ${event.time}` : "（整天）";
	return `${Number(month)}/${Number(day)}（${weekday}）${time}`.trim();
}
