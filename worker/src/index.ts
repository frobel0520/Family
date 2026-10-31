import { handleAuthCallback, handleAuthLogout, handleAuthRefresh } from "./routes/auth";
import { handleMe } from "./routes/me";
import {
	handleListBoardPosts,
	handleCreateBoardPost,
	handleDeleteBoardPost,
	handleEditBoardPost,
	handleCreateBoardComment,
	handleDeleteBoardComment,
	handleToggleBoardReaction,
} from "./routes/board";
import {
	handleListEvents,
	handleCreateEvent,
	handleUpdateEvent,
	handleDeleteEvent,
	runDueReminders,
} from "./routes/calendar";
import { handleListFamily } from "./routes/family";
import { handleListRecipes, handleCreateRecipe, handleUploadRecipeImage } from "./routes/recipes";
import { handleListOrders, handleCreateOrder, handleDeleteOrder } from "./routes/orders";
import { handleListPending, handleApprove, handleDeny } from "./routes/admin";
import { handlePushSubscribe, handlePushUnsubscribe } from "./routes/push";
import { handleGetProfile, handleUpdateProfile } from "./routes/profile";
import { handleImage } from "./routes/image";
import { jsonResponse } from "./response";
import { requireSession } from "./session";

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);

	if (request.method === "POST" && url.pathname === "/api/auth/callback") {
		return handleAuthCallback(request, env, ctx);
	}

	if (request.method === "POST" && url.pathname === "/api/auth/refresh") {
		return handleAuthRefresh(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/auth/logout") {
		return handleAuthLogout();
	}

	if (request.method === "GET" && url.pathname === "/api/me") {
		return handleMe(request, env);
	}

	if (request.method === "GET" && url.pathname === "/api/board") {
		return handleListBoardPosts(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/board") {
		return handleCreateBoardPost(request, env, ctx);
	}

	if (request.method === "POST" && url.pathname === "/api/board/delete") {
		return handleDeleteBoardPost(request, env);
	}
	if (request.method === "POST" && url.pathname === "/api/board/edit") {
		return handleEditBoardPost(request, env);
	}
	if (request.method === "GET" && url.pathname === "/api/board/edit") {
		const auth = await requireSession(request, env);
		return "response" in auth ? auth.response : jsonResponse({ textEdit: true });
	}

	if (request.method === "POST" && url.pathname === "/api/board/react") {
		return handleToggleBoardReaction(request, env, ctx);
	}

	if (request.method === "POST" && url.pathname === "/api/board/comment") {
		return handleCreateBoardComment(request, env, ctx);
	}

	if (request.method === "POST" && url.pathname === "/api/board/comment/delete") {
		return handleDeleteBoardComment(request, env);
	}

	if (request.method === "GET" && url.pathname === "/api/events") {
		return handleListEvents(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/events") {
		return handleCreateEvent(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/events/update") {
		return handleUpdateEvent(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/events/delete") {
		return handleDeleteEvent(request, env);
	}

	if (request.method === "GET" && url.pathname === "/api/family") {
		return handleListFamily(request, env);
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
		return handleCreateOrder(request, env, ctx);
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

	if (request.method === "GET" && url.pathname === "/api/profile") {
		return handleGetProfile(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/profile") {
		return handleUpdateProfile(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/push/subscribe") {
		return handlePushSubscribe(request, env);
	}

	if (request.method === "POST" && url.pathname === "/api/push/unsubscribe") {
		return handlePushUnsubscribe(request, env);
	}

	if (request.method === "GET" && url.pathname === "/api/image") {
		return handleImage(request, env);
	}

	return jsonResponse({ error: "Not found" }, 404);
}

/**
 * 前端與 API 同源，不開 CORS。改資料的請求必須來自同一個 origin（防 CSRF；
 * SameSite=Strict 已擋跨站，這裡再擋同站但不同主機的 *.workers.dev）。
 */
export function isSameOriginWrite(request: Request): boolean {
	if (request.method === "GET" || request.method === "HEAD") return true;
	const origin = request.headers.get("Origin");
	if (origin !== null) return origin === new URL(request.url).origin;
	return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

function withApiHeaders(response: Response): Response {
	const headers = new Headers(response.headers);
	if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Referrer-Policy", "no-referrer");
	return new Response(response.body, { status: response.status, headers });
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		if (!isSameOriginWrite(request)) {
			return withApiHeaders(jsonResponse({ error: "Cross-origin request blocked" }, 403));
		}

		return withApiHeaders(await route(request, env, ctx));
	},

	/** Cron Trigger（wrangler.jsonc 的 triggers.crons）：行事曆的提醒推播。 */
	async scheduled(_controller, env, ctx): Promise<void> {
		ctx.waitUntil(runDueReminders(env));
	},
} satisfies ExportedHandler<Env>;

