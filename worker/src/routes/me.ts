import { requireSession } from "../session";
import { jsonResponse } from "../response";
import { storedAvatarUrl } from "../image-url";

export async function handleMe(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	return jsonResponse({
		name: auth.session.name,
		avatar: await storedAvatarUrl(request, auth.session.avatar, env.JWT_SECRET),
		isOwner: auth.session.isOwner,
	});
}
