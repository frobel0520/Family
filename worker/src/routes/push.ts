import { requireSession } from "../session";
import { jsonResponse } from "../response";
import { saveSubscription, subscriptionKey, type StoredSubscription } from "../notify";
import type { PushSubscriptionJSON } from "../web-push";

function isAllowedWebPushEndpoint(url: URL): boolean {
	const host = url.hostname.toLowerCase();
	if (!host || host.endsWith(".")) return false;

	if (host === "fcm.googleapis.com") return true;
	if (host === "android.googleapis.com" && url.pathname.startsWith("/gcm/")) return true;
	if (host === "push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com")) {
		return true;
	}
	if (host.endsWith(".push.apple.com")) {
		return true;
	}
	if (host.endsWith(".notify.windows.com")) {
		return true;
	}
	return false;
}

export function isValidSubscription(sub: unknown): sub is PushSubscriptionJSON {
	if (typeof sub !== "object" || sub === null) return false;
	const s = sub as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
	if (
		typeof s.endpoint !== "string" ||
		!s.endpoint ||
		typeof s.keys?.p256dh !== "string" ||
		!s.keys.p256dh.trim() ||
		typeof s.keys?.auth !== "string" ||
		!s.keys.auth.trim()
	) {
		return false;
	}

	let parsed: URL;
	try {
		parsed = new URL(s.endpoint);
	} catch {
		return false;
	}

	if (parsed.protocol !== "https:") return false;
	if (parsed.port !== "" && parsed.port !== "443") return false;
	if (parsed.username !== "" || parsed.password !== "") return false;
	if (!isAllowedWebPushEndpoint(parsed)) return false;
	if (subscriptionKey(s.endpoint).length > 512) return false;

	return true;
}

/** 註冊這台裝置的推播訂閱（瀏覽器 pushManager.subscribe() 的結果）。 */
export async function handlePushSubscribe(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	let body: { subscription?: unknown };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}
	if (!isValidSubscription(body.subscription)) {
		return jsonResponse({ error: "Missing or invalid 'subscription'" }, 400);
	}

	const stored: StoredSubscription = {
		subscription: body.subscription,
		email: auth.session.email.toLowerCase(),
		name: auth.session.name,
		createdAt: new Date().toISOString(),
	};
	await saveSubscription(env, stored);

	return jsonResponse({ ok: true }, 201);
}

/** 解除這台裝置的推播訂閱。 */
export async function handlePushUnsubscribe(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	let body: { endpoint?: string };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}
	if (!body.endpoint || typeof body.endpoint !== "string") {
		return jsonResponse({ error: "Missing 'endpoint'" }, 400);
	}

	const key = subscriptionKey(body.endpoint);
	const existing = await env.PUSH_SUBS.get<StoredSubscription>(key, "json");
	if (existing && (existing.email === auth.session.email.toLowerCase() || auth.session.isOwner)) {
		await env.PUSH_SUBS.delete(key);
	}
	return jsonResponse({ ok: true });
}
