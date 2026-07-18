import { verifySession, type SessionPayload } from "./jwt";
import { jsonResponse } from "./response";

/**
 * Reads the "Authorization: Bearer <token>" header and verifies it.
 * Returns the session payload on success, or a ready-to-return 401 Response on failure.
 */
export async function requireSession(
	request: Request,
	env: Env,
): Promise<{ session: SessionPayload } | { response: Response }> {
	const authHeader = request.headers.get("Authorization");
	const token = authHeader?.match(/^Bearer (.+)$/)?.[1];

	if (!token) {
		return { response: jsonResponse({ error: "Missing Authorization header" }, 401) };
	}

	const session = await verifySession(token, env.JWT_SECRET);
	if (!session) {
		return { response: jsonResponse({ error: "Invalid or expired session" }, 401) };
	}

	return { session };
}
