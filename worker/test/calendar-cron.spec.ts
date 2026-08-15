import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import worker from "../src/index";
import { encodeBase64Utf8, decodeBase64Utf8 } from "../src/base64";
import { subscriptionKey, type StoredSubscription } from "../src/notify";
import type { FamilyEvent } from "../src/events";

/**
 * Cron 提醒的端對端驗證（不碰真的裝置，也不打真的 GitHub）：
 * 攔截 fetch 假扮 GitHub Contents API 與推播服務，跑一次 worker.scheduled(...)，
 * 檢查「只推給勾選的人」「沒到期的不推」「推完寫回 notifiedAt」。
 */

const PUSH_HOST = "https://push.example.com";
/** RFC 8291 測試向量的接收端金鑰，拿來當有效的訂閱金鑰用 */
const UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const UA_AUTH = "BTBZMqHH6r4Tts7J_aSIgg";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

/** 台灣時間的 "YYYY-MM-DDTHH:mm"，offsetMinutes 是相對現在的偏移 */
function taipeiStamp(offsetMinutes: number): string {
	const shifted = new Date(Date.now() + offsetMinutes * 60_000 + 8 * 60 * 60_000);
	return shifted.toISOString().slice(0, 16);
}

function eventAt(id: string, remindAt: string, remindEmails: string[]): FamilyEvent {
	const [date, time] = remindAt.split("T");
	return {
		id,
		title: `活動 ${id}`,
		date,
		time,
		createdBy: "瑜ㄐ",
		createdByEmail: "yu@example.com",
		createdAt: "2026-08-15T00:00:00.000Z",
		updatedAt: "2026-08-15T00:00:00.000Z",
		remindEmails,
		remindAt,
		notifiedAt: null,
	};
}

async function seedSubscription(email: string, endpoint: string) {
	const value: StoredSubscription = {
		subscription: { endpoint, keys: { p256dh: UA_PUBLIC, auth: UA_AUTH } },
		email,
		name: email,
		createdAt: "2026-08-15T00:00:00.000Z",
	};
	await env.PUSH_SUBS.put(subscriptionKey(endpoint), JSON.stringify(value));
}

/** 產一把真的 VAPID 私鑰，讓 sendWebPush 真的走到「POST 到推播端點」那一步 */
async function seedVapidKeys() {
	const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
	const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
	(env as { VAPID_PRIVATE_JWK: string }).VAPID_PRIVATE_JWK = JSON.stringify(jwk);
}

describe("行事曆提醒的 cron", () => {
	it("只推給該活動勾選的人，沒到期的不推，推完寫回 notifiedAt", async () => {
		await seedVapidKeys();
		await seedSubscription("chien@example.com", `${PUSH_HOST}/chien`);
		await seedSubscription("other@example.com", `${PUSH_HOST}/other`);

		const events: FamilyEvent[] = [
			eventAt("due", taipeiStamp(-1), ["chien@example.com"]), // 一分鐘前該提醒
			eventAt("later", taipeiStamp(60), ["chien@example.com", "other@example.com"]), // 一小時後才提醒
		];

		const pushed: string[] = [];
		let written: FamilyEvent[] | null = null;

		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			const method = init?.method ?? (input instanceof Request ? input.method : "GET");

			if (url.startsWith(PUSH_HOST)) {
				pushed.push(url);
				return new Response(null, { status: 201 });
			}
			if (url.includes("/contents/data/events.json")) {
				if (method === "PUT") {
					const body = JSON.parse(String(init?.body)) as { content: string };
					written = JSON.parse(decodeBase64Utf8(body.content));
					return Response.json({ content: {} });
				}
				return Response.json({ content: encodeBase64Utf8(JSON.stringify(events)), sha: "sha-1" });
			}
			throw new Error(`unexpected fetch: ${method} ${url}`);
		}) as typeof fetch;

		const ctx = createExecutionContext();
		await worker.scheduled!(
			{ cron: "*/5 * * * *", scheduledTime: Date.now(), noRetry() {} },
			env,
			ctx,
		);
		await waitOnExecutionContext(ctx);

		// 只有 chien 收到，other 沒被勾選就不會被吵
		expect(pushed).toEqual([`${PUSH_HOST}/chien`]);

		const saved = written as FamilyEvent[] | null;
		expect(saved).not.toBeNull();
		expect(saved!.find((e) => e.id === "due")?.notifiedAt).toBeTruthy();
		expect(saved!.find((e) => e.id === "later")?.notifiedAt).toBeNull();
	});

	it("沒有到期的提醒時完全不寫檔（不會每 5 分鐘產生一個 commit）", async () => {
		await seedVapidKeys();
		await seedSubscription("chien@example.com", `${PUSH_HOST}/chien`);

		const events = [eventAt("later", taipeiStamp(120), ["chien@example.com"])];
		let writes = 0;

		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			const method = init?.method ?? "GET";
			if (url.includes("/contents/data/events.json")) {
				if (method === "PUT") {
					writes += 1;
					return Response.json({ content: {} });
				}
				return Response.json({ content: encodeBase64Utf8(JSON.stringify(events)), sha: "sha-1" });
			}
			throw new Error(`unexpected fetch: ${method} ${url}`);
		}) as typeof fetch;

		const ctx = createExecutionContext();
		await worker.scheduled!({ cron: "*/5 * * * *", scheduledTime: Date.now(), noRetry() {} }, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(writes).toBe(0);
	});
});
