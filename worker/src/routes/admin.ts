import { requireOwner } from "../session";
import { listPending, approveEmail, denyEmail } from "../access";
import { jsonResponse } from "../response";

export async function handleListPending(request: Request, env: Env): Promise<Response> {
	const auth = await requireOwner(request, env);
	if ("response" in auth) return auth.response;

	return jsonResponse(await listPending(env));
}

async function parseEmailBody(request: Request): Promise<{ email?: string }> {
	try {
		return await request.json();
	} catch {
		return {};
	}
}

export async function handleApprove(request: Request, env: Env): Promise<Response> {
	const auth = await requireOwner(request, env);
	if ("response" in auth) return auth.response;

	const { email } = await parseEmailBody(request);
	if (!email) return jsonResponse({ error: "Missing 'email'" }, 400);

	await approveEmail(env, email);
	return jsonResponse({ ok: true });
}

export async function handleDeny(request: Request, env: Env): Promise<Response> {
	const auth = await requireOwner(request, env);
	if ("response" in auth) return auth.response;

	const { email } = await parseEmailBody(request);
	if (!email) return jsonResponse({ error: "Missing 'email'" }, 400);

	await denyEmail(env, email);
	return jsonResponse({ ok: true });
}
