import { describe, expect, it } from "vitest";
import {
	compareEvents,
	dueReminders,
	eventSummary,
	isValidDate,
	isValidRemindAt,
	isValidTime,
	taipeiToEpochMs,
	toTaipeiDateString,
	type FamilyEvent,
} from "../src/events";

function event(overrides: Partial<FamilyEvent> = {}): FamilyEvent {
	return {
		id: "e1",
		title: "家庭聚餐",
		date: "2026-08-20",
		time: "09:00",
		createdBy: "瑜ㄐ",
		createdByEmail: "yu@example.com",
		createdAt: "2026-08-15T00:00:00.000Z",
		updatedAt: "2026-08-15T00:00:00.000Z",
		remindEmails: ["chien@example.com"],
		remindAt: "2026-08-20T08:00",
		notifiedAt: null,
		...overrides,
	};
}

/** 提醒時間 2026-08-20 08:00（台灣）＝ 2026-08-20T00:00Z */
const REMIND_MS = Date.parse("2026-08-20T00:00:00.000Z");

describe("欄位驗證", () => {
	it("擋掉格式對但不存在的日期", () => {
		expect(isValidDate("2026-08-20")).toBe(true);
		expect(isValidDate("2026-02-31")).toBe(false);
		expect(isValidDate("2026/08/20")).toBe(false);
	});

	it("時間與提醒時間只收 24 小時制", () => {
		expect(isValidTime("09:00")).toBe(true);
		expect(isValidTime("24:00")).toBe(false);
		expect(isValidRemindAt("2026-08-20T08:00")).toBe(true);
		expect(isValidRemindAt("2026-08-20 08:00")).toBe(false);
	});
});

describe("台灣時間換算", () => {
	it("存的是台灣的牆上時間，比較時才補 +08:00", () => {
		expect(taipeiToEpochMs("2026-08-20", "09:00")).toBe(Date.parse("2026-08-20T01:00:00.000Z"));
		expect(taipeiToEpochMs("2026-08-20")).toBe(Date.parse("2026-08-19T16:00:00.000Z")); // 整天活動 = 當地 00:00
	});

	it("UTC 的深夜換算成台灣已經是隔天", () => {
		expect(toTaipeiDateString(new Date("2026-08-19T16:30:00.000Z"))).toBe("2026-08-20");
	});
});

describe("dueReminders", () => {
	it("時間到才送", () => {
		expect(dueReminders([event()], REMIND_MS - 60_000)).toHaveLength(0);
		expect(dueReminders([event()], REMIND_MS)).toHaveLength(1);
	});

	it("送過的不再送、沒勾對象的不送、沒設提醒時間的不送", () => {
		const sent = event({ id: "sent", notifiedAt: "2026-08-20T00:00:00.000Z" });
		const noTargets = event({ id: "no-targets", remindEmails: [] });
		const noTime = event({ id: "no-time", remindAt: null });
		expect(dueReminders([sent, noTargets, noTime], REMIND_MS)).toEqual([]);
	});

	it("cron 停太久不補送過期太多的提醒（不然恢復後會一次洗版）", () => {
		const twoDaysLate = REMIND_MS + 2 * 24 * 60 * 60 * 1000;
		expect(dueReminders([event()], twoDaysLate)).toHaveLength(0);
	});
});

describe("顯示", () => {
	it("摘要帶星期，整天活動不顯示時間", () => {
		expect(eventSummary(event())).toBe("8/20（四） 09:00");
		expect(eventSummary(event({ time: null }))).toBe("8/20（四）（整天）");
	});

	it("同一天的整天活動排在有時間的前面", () => {
		const allDay = event({ id: "all-day", time: null });
		const morning = event({ id: "morning", time: "09:00" });
		expect([morning, allDay].sort(compareEvents).map((e) => e.id)).toEqual(["all-day", "morning"]);
	});
});
