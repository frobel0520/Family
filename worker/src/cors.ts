/**
 * Only the family's GitHub Pages origin (env.ALLOWED_ORIGIN) is allowed to call this Worker.
 * Exact match only — no wildcards, since this is a private family app, not a public API.
 */

function isAllowedOrigin(request: Request, env: Env): string | null {
	const origin = request.headers.get("Origin");
	return origin && origin === env.ALLOWED_ORIGIN ? origin : null;
}

export function corsHeaders(request: Request, env: Env): HeadersInit {
	const origin = isAllowedOrigin(request, env);
	if (!origin) return {};

	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	};
}

export function handlePreflight(request: Request, env: Env): Response {
	return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

export function withCors(response: Response, request: Request, env: Env): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(corsHeaders(request, env))) {
		headers.set(key, value);
	}
	return new Response(response.body, { status: response.status, headers });
}
