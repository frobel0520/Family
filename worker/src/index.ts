import { handleAuthCallback } from "./routes/auth";
import { handleMe } from "./routes/me";
import {
	handleListBoardPosts,
	handleCreateBoardPost,
	handleDeleteBoardPost,
	handleCreateBoardComment,
	handleDeleteBoardComment,
} from "./routes/board";
import { handleListRecipes, handleCreateRecipe, handleUploadRecipeImage } from "./routes/recipes";
import { handleListOrders, handleCreateOrder, handleDeleteOrder } from "./routes/orders";
import { handleListPending, handleApprove, handleDeny } from "./routes/admin";
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

	if (request.method === "GET" && url.pathname === "/api/board") {
		return handleListBoardPosts(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/board") {
		return handleCreateBoardPost(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/board/delete") {
		return handleDeleteBoardPost(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/board/comment") {
		return handleCreateBoardComment(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/board/comment/delete") {
		return handleDeleteBoardComment(request, env);
	}

	if (request.method === "GET" && url.pathname === "/api/recipes") {
		return handleListRecipes(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/recipes") {
		return handleCreateRecipe(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/recipes/recipe-image") {
		return handleUploadRecipeImage(request, env);
	}

	if (request.method === "GET" && url.pathname === "/api/orders") {
		return handleListOrders(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/orders") {
		return handleCreateOrder(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/orders/delete") {
		return handleDeleteOrder(request, env);
	}

	if (request.method === "GET" && url.pathname === "/api/admin/pending") {
		return handleListPending(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/admin/approve") {
		return handleApprove(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/admin/deny") {
		return handleDeny(request, env);
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
