import { handleAuthCallback } from "./routes/auth";
import { handleMe } from "./routes/me";
import { handleCreateBoardPost } from "./routes/board";
import { handleCreateRecipe } from "./routes/recipes";
import { handleCreateOrder } from "./routes/orders";
import { jsonResponse } from "./response";
import { handlePreflight, withCors } from "./cors";

async function route(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);

	if (request.method === "POST" && url.pathname === "/api/auth/callback") {
		return handleAuthCallback(request, env);
	}

	if (request.method === "GET" && url.pathname === "/api/me") {
		return handleMe(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/board") {
		return handleCreateBoardPost(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/recipes") {
		return handleCreateRecipe(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/orders") {
		return handleCreateOrder(request, env);
	}

	return jsonResponse({ error: "Not found" }, 404);
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		if (request.method === "OPTIONS") {
			return handlePreflight(request, env);
		}

		const response = await route(request, env);
		return withCors(response, request, env);
	},
} satisfies ExportedHandler<Env>;
