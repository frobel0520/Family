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

async function listAllSubscriptions(env: Env): Promise<{ key: string; value: StoredSubscription }[]> {
	const results: { key: string; value: StoredSubscription }[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.PUSH_SUBS.list({ prefix: KEY_PREFIX, cursor });
		for (const entry of page.keys) {
			const value = await env.PUSH_SUBS.get<StoredSubscription>(entry.name, "json");
			if (value) results.push({ key: entry.name, value });
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return results;
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
