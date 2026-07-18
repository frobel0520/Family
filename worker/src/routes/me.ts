import { requireSession } from "../session";
import { jsonResponse } from "../response";

export async function handleMe(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	return jsonResponse({ name: auth.session.name, avatar: auth.session.avatar, isOwner: auth.session.isOwner });
}
