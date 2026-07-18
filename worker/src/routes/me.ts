import { requireSession } from "../session";
import { jsonResponse } from "../response";

export async function handleMe(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	return jsonResponse({ username: auth.session.sub, avatar: auth.session.avatar });
}
