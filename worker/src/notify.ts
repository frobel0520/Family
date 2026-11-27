import { sendWebPush, bytesToBase64Url, type PushSubscriptionJSON } from "./web-push";

/**
 * 推播訂閱的儲存（Cloudflare KV）與群發。
 * 一個 KV entry = 一台裝置的訂閱，key 是 endpoint 的 base64url（KV key 有 512 字元上限，夠用）。
 * 同一個人多台裝置就是多個 entry，用 email 欄位歸戶。
 */

export interface StoredSubscription {
	subscription: PushSubscriptionJSON;
	email: string; // 訂閱者（小寫），發通知時用來排除本人 / 指定收件人
	name: string;
	createdAt: string;
}

const KEY_PREFIX = "sub:";
export const MAX_SUBSCRIPTIONS_PER_USER = 5;
export const MAX_TOTAL_SUBSCRIPTIONS = 30;
const MAX_KV_METADATA_BYTES = 1000;

export function subscriptionKey(endpoint: string): string {
	return KEY_PREFIX + bytesToBase64Url(new TextEncoder().encode(endpoint));
}

export interface PushMessage {
	title: string;
	body: string;
	url?: string; // 點通知後開啟的頁面，例如 "/Family/#/board"
	tag?: string; // 同 tag 的通知會摺疊成一則（Android；iOS 系統本來就會依 App 堆疊）
	icon?: string; // 通知縮圖，放觸發者的大頭貼（iOS 不支援自訂，固定顯示 App 圖示）
}

function isStoredSubscriptionMetadata(meta: unknown): meta is StoredSubscription {
	if (!meta || typeof meta !== "object") return false;
	const m = meta as Partial<StoredSubscription>;
	return (
		typeof m.email === "string" &&
		typeof m.name === "string" &&
		typeof m.createdAt === "string" &&
		typeof m.subscription === "object" &&
		m.subscription !== null &&
		typeof m.subscription.endpoint === "string" &&
		typeof m.subscription.keys?.p256dh === "string" &&
		typeof m.subscription.keys?.auth === "string"
	);
}

function compareEntriesByAge(
	a: { key: string; value: StoredSubscription },
	b: { key: string; value: StoredSubscription },
): number {
	const timeDiff = (a.value.createdAt || "").localeCompare(b.value.createdAt || "");
	return timeDiff !== 0 ? timeDiff : a.key.localeCompare(b.key);
}

export async function listAllSubscriptions(env: Env): Promise<{ key: string; value: StoredSubscription }[]> {
	const results: { key: string; value: StoredSubscription }[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.PUSH_SUBS.list({ prefix: KEY_PREFIX, cursor });
		for (const entry of page.keys) {
			const value = isStoredSubscriptionMetadata(entry.metadata)
				? entry.metadata
				: await env.PUSH_SUBS.get<StoredSubscription>(entry.name, "json");
			if (value) results.push({ key: entry.name, value });
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return results;
}

/**
 * 儲存訂閱並執行雙重容量上限（每人最多 5 台裝置、全站最多 30 筆 KV 訂閱），
 * 超額時淘汰最舊項目，確保群發推播永遠不會超過 Cloudflare Workers 50 次 subrequest 上限。
 */
export async function saveSubscription(env: Env, stored: StoredSubscription): Promise<void> {
	const key = subscriptionKey(stored.subscription.endpoint);
	const normalizedEmail = stored.email.toLowerCase();
	const normalizedStored: StoredSubscription = { ...stored, email: normalizedEmail };

	const existingAll = await listAllSubscriptions(env);
	const others = existingAll.filter((entry) => entry.key !== key);
	const keysToEvict = new Set<string>();

	const userOthers = others.filter((entry) => entry.value.email.toLowerCase() === normalizedEmail).sort(compareEntriesByAge);
	if (userOthers.length >= MAX_SUBSCRIPTIONS_PER_USER) {
		const evictCount = userOthers.length - (MAX_SUBSCRIPTIONS_PER_USER - 1);
		for (let i = 0; i < evictCount; i++) {
			keysToEvict.add(userOthers[i].key);
		}
	}

	const remainingOthers = others.filter((entry) => !keysToEvict.has(entry.key)).sort(compareEntriesByAge);
	if (remainingOthers.length >= MAX_TOTAL_SUBSCRIPTIONS) {
		const evictCount = remainingOthers.length - (MAX_TOTAL_SUBSCRIPTIONS - 1);
		for (let i = 0; i < evictCount; i++) {
			keysToEvict.add(remainingOthers[i].key);
		}
	}

	if (keysToEvict.size > 0) {
		await Promise.all([...keysToEvict].map((evictKey) => env.PUSH_SUBS.delete(evictKey)));
	}

	const serialized = JSON.stringify(normalizedStored);
	const putOptions =
		new TextEncoder().encode(serialized).byteLength <= MAX_KV_METADATA_BYTES
			? { metadata: normalizedStored }
			: undefined;
	await env.PUSH_SUBS.put(key, serialized, putOptions);
}

async function sendTo(env: Env, entries: { key: string; value: StoredSubscription }[], message: PushMessage) {
	await Promise.all(
		entries.map(async ({ key, value }) => {
			const result = await sendWebPush(env, value.subscription, message);
			// 訂閱已失效（重裝、解除安裝、清資料）→ 順手清掉
			if (result === "gone") await env.PUSH_SUBS.delete(key);
		}),
	);
}

/** 通知所有訂閱者（可排除觸發者本人，不用被自己的動作吵）。 */
export async function notifyAll(env: Env, message: PushMessage, excludeEmail?: string): Promise<void> {
	const all = await listAllSubscriptions(env);
	const targets = excludeEmail
		? all.filter(({ value }) => value.email !== excludeEmail.toLowerCase())
		: all;
	await sendTo(env, targets, message);
}

/** 只通知某個 email 的所有裝置（例如登入申請只通知擁有者）。 */
export async function notifyEmail(env: Env, email: string, message: PushMessage): Promise<void> {
	const all = await listAllSubscriptions(env);
	await sendTo(env, all.filter(({ value }) => value.email === email.toLowerCase()), message);
}

/** 通知內文摘要：截斷長貼文，通知欄不用看完整篇。 */
export function excerpt(text: string, max = 80): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}
