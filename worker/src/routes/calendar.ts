import { requireSession } from "../session";
import { readJsonArrayFile, updateJsonArrayFile } from "../github-contents";
import { jsonResponse } from "../response";
import { notifyEmail } from "../notify";
import { avatarForStoredAuthor, listProfiles, type Profile } from "../profiles";
import { listFamilyEmails } from "../family";
import {
	compareEvents,
	dueReminders,
	eventSummary,
	isValidDate,
	isValidRemindAt,
	isValidTime,
	MAX_NOTE_LENGTH,
	MAX_TITLE_LENGTH,
	type FamilyEvent,
} from "../events";

const EVENTS_PATH = "data/events.json";

/** 建立者的頭像跟貼文一樣是「顯示時才解析」，不是存檔時的快照。 */
async function withAuthorAvatar(
	request: Request,
	env: Env,
	event: FamilyEvent,
	profiles: Profile[],
): Promise<FamilyEvent & { avatar: string | null }> {
	return {
		...event,
		avatar: await avatarForStoredAuthor(request, env, profiles, {
			authorEmail: event.createdByEmail,
			authorName: event.createdBy,
		}),
	};
}

interface EventInput {
	title: string;
	date: string;
	time: string | null;
	note: string;
	remindEmails: string[];
	remindAt: string | null;
}

/** 表單欄位的驗證；回字串代表擋下來的理由。 */
async function parseEventInput(
	env: Env,
	body: Record<string, unknown>,
): Promise<EventInput | { error: string }> {
	const title = typeof body.title === "string" ? body.title.trim() : "";
	if (!title) return { error: "活動名稱不能空白" };
	if (title.length > MAX_TITLE_LENGTH) return { error: `活動名稱最多 ${MAX_TITLE_LENGTH} 個字` };

	if (!isValidDate(body.date)) return { error: "日期格式不對" };
	const time = body.time === null || body.time === undefined || body.time === "" ? null : body.time;
	if (time !== null && !isValidTime(time)) return { error: "時間格式不對" };

	const note = typeof body.note === "string" ? body.note.trim() : "";
	if (note.length > MAX_NOTE_LENGTH) return { error: `備註最多 ${MAX_NOTE_LENGTH} 個字` };

	const rawEmails = Array.isArray(body.remindEmails) ? body.remindEmails : [];
	const remindEmails = [
		...new Set(rawEmails.filter((e): e is string => typeof e === "string").map((e) => e.toLowerCase())),
	];
	// 只能提醒家裡的人，不能拿這個端點對任意信箱發推播
	const family = await listFamilyEmails(env);
	const stranger = remindEmails.find((email) => !family.includes(email));
	if (stranger) return { error: "提醒對象不在家人名單裡" };

	const remindAt = body.remindAt === null || body.remindAt === undefined || body.remindAt === "" ? null : body.remindAt;
	if (remindAt !== null && !isValidRemindAt(remindAt)) return { error: "提醒時間格式不對" };
	if (remindEmails.length > 0 && !remindAt) return { error: "有勾選提醒對象就要設定提醒時間" };

	return { title, date: body.date, time, note, remindEmails, remindAt: remindEmails.length ? remindAt : null };
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
	try {
		return (await request.json()) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export async function handleListEvents(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	const [events, profiles] = await Promise.all([
		readJsonArrayFile<FamilyEvent>(env, EVENTS_PATH),
		listProfiles(env),
	]);
	events.sort(compareEvents);
	return jsonResponse(await Promise.all(events.map((e) => withAuthorAvatar(request, env, e, profiles))));
}

export async function handleCreateEvent(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	const body = await readBody(request);
	if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);

	const input = await parseEventInput(env, body);
	if ("error" in input) return jsonResponse({ error: input.error }, 400);

	const now = new Date().toISOString();
	const event: FamilyEvent = {
		id: crypto.randomUUID(),
		title: input.title,
		date: input.date,
		time: input.time,
		note: input.note,
		createdBy: auth.session.name,
		createdByEmail: auth.session.email.toLowerCase(),
		createdAt: now,
		updatedAt: now,
		remindEmails: input.remindEmails,
		remindAt: input.remindAt,
		notifiedAt: null,
	};

	await updateJsonArrayFile<FamilyEvent>(
		env,
		EVENTS_PATH,
		(events) => [...events, event],
		`calendar: ${auth.session.name} 新增「${input.title}」（${input.date}）`,
	);

	return jsonResponse(await withAuthorAvatar(request, env, event, await listProfiles(env)), 201);
}

/**
 * 編輯活動：**任何家人都可以改**（使用者指定「大家都可以編輯」），不限建立者。
 * 提醒時間或對象一改就把 notifiedAt 清掉，改過的提醒才會重新送。
 */
export async function handleUpdateEvent(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	const body = await readBody(request);
	if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
	if (typeof body.id !== "string" || !body.id) return jsonResponse({ error: "Missing 'id'" }, 400);

	const input = await parseEventInput(env, body);
	if ("error" in input) return jsonResponse({ error: input.error }, 400);

	const eventId = body.id;
	let updated: FamilyEvent | null = null;
	await updateJsonArrayFile<FamilyEvent>(
		env,
		EVENTS_PATH,
		(events) =>
			events.map((event) => {
				if (event.id !== eventId) return event;
				const remindChanged =
					event.remindAt !== input.remindAt ||
					event.remindEmails.join(",") !== input.remindEmails.join(",");
				updated = {
					...event,
					title: input.title,
					date: input.date,
					time: input.time,
					note: input.note,
					remindEmails: input.remindEmails,
					remindAt: input.remindAt,
					notifiedAt: remindChanged ? null : (event.notifiedAt ?? null),
					updatedAt: new Date().toISOString(),
				};
				return updated;
			}),
		`calendar: ${auth.session.name} 編輯「${input.title}」（${input.date}）`,
	);

	if (!updated) return jsonResponse({ error: "Event not found" }, 404);
	return jsonResponse(await withAuthorAvatar(request, env, updated, await listProfiles(env)));
}

/** 刪活動：跟訂單一樣，任何家人都能刪（前端會先跳確認）。 */
export async function handleDeleteEvent(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	const body = await readBody(request);
	if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
	if (typeof body.id !== "string" || !body.id) return jsonResponse({ error: "Missing 'id'" }, 400);

	const events = await readJsonArrayFile<FamilyEvent>(env, EVENTS_PATH);
	const target = events.find((e) => e.id === body.id);
	if (!target) return jsonResponse({ error: "Event not found" }, 404);

	await updateJsonArrayFile<FamilyEvent>(
		env,
		EVENTS_PATH,
		(list) => list.filter((e) => e.id !== body.id),
		`calendar: ${auth.session.name} 刪除「${target.title}」（${target.date}）`,
	);

	return jsonResponse({ ok: true });
}

/**
 * Cron 每 5 分鐘跑一次（見 index.ts 的 scheduled handler）：把到期的提醒推給
 * **該活動勾選的人**，不群發。送出後在活動上寫 notifiedAt，同一則不會再送第二次。
 */
export async function runDueReminders(env: Env, now = new Date()): Promise<number> {
	const events = await readJsonArrayFile<FamilyEvent>(env, EVENTS_PATH);
	const due = dueReminders(events, now.getTime());
	if (due.length === 0) return 0;

	for (const event of due) {
		await Promise.all(
			event.remindEmails.map((email) =>
				notifyEmail(env, email, {
					title: `📅 ${event.title}`,
					body: event.note ? `${eventSummary(event)}・${event.note}` : eventSummary(event),
					url: "/Family/#/calendar",
					tag: "calendar",
				}),
			),
		);
	}

	const notifiedIds = new Set(due.map((e) => e.id));
	const stamp = now.toISOString();
	await updateJsonArrayFile<FamilyEvent>(
		env,
		EVENTS_PATH,
		(list) => list.map((e) => (notifiedIds.has(e.id) ? { ...e, notifiedAt: stamp } : e)),
		`calendar: 送出 ${due.length} 則提醒`,
	);

	return due.length;
}
