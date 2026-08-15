import { requireSession } from "../session";
import { jsonResponse } from "../response";
import { listFamilyMembers } from "../family";

/** 已核准的家人名單（顯示名＋大頭貼），行事曆勾選提醒對象用。登入才看得到。 */
export async function handleListFamily(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	return jsonResponse(await listFamilyMembers(request, env));
}
