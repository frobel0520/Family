import { subscribePush, unsubscribePush } from "./api";

/** Worker 那把 VAPID 金鑰的公鑰（worker/wrangler.jsonc 的 VAPID_PUBLIC_KEY，兩邊要一致） */
const VAPID_PUBLIC_KEY = "BC76hqNkJ9FmeXE1FKBXmv0v45n8yUdBeFvqtgmXR9B4n89iITOmjcnIV0z5-q97DQA6ZI7TmWjNueL0RRzmW-o";

export function pushSupported(): boolean {
	return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function base64UrlToUint8Array(str: string): Uint8Array {
	const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
	if (!pushSupported()) return null;
	const registration = await navigator.serviceWorker.ready;
	return registration.pushManager.getSubscription();
}

/** 開啟通知：要權限 → 跟瀏覽器拿訂閱 → 存到 Worker。必須由使用者點擊觸發（瀏覽器規定）。 */
export async function enablePush(token: string): Promise<void> {
	const permission = await Notification.requestPermission();
	if (permission !== "granted") {
		throw new Error("沒有拿到通知權限。如果之前按過「不允許」，要去瀏覽器設定裡手動開啟。");
	}
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
	});
	await subscribePush(token, subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
}

/** 關閉通知：取消瀏覽器訂閱 + 從 Worker 移除。 */
export async function disablePush(token: string): Promise<void> {
	const subscription = await getCurrentSubscription();
	if (!subscription) return;
	const endpoint = subscription.endpoint;
	await subscription.unsubscribe();
	await unsubscribePush(token, endpoint);
}
