import { requireSession } from "../session";
import { jsonResponse } from "../response";
import { subscriptionKey, type StoredSubscription } from "../notify";
import type { PushSubscriptionJSON } from "../web-push";

function isValidSubscription(sub: unknown): sub is PushSubscriptionJSON {
	if (typeof sub !== "object" || sub === null) return false;
	const s = sub as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
	return (
		typeof s.endpoint === "string" &&
		s.endpoint.startsWith("https://") &&
		typeof s.keys?.p256dh === "string" &&
		typeof s.keys?.auth === "string"
	);
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
	await env.PUSH_SUBS.put(subscriptionKey(body.subscription.endpoint), JSON.stringify(stored));

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
