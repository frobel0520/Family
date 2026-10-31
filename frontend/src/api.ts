import type {
	BoardComment,
	BoardPost,
	FamilyEvent,
	FamilyMember,
	Order,
	PendingRequest,
	Profile,
	ReactionSummary,
	Recipe,
} from "./types";
import type { SessionResponse } from "./auth/types";


async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	// 前端與 Worker 同源：session 放在 HttpOnly cookie，瀏覽器自動帶上，JS 讀不到也不經手。
	const response = await fetch(path, {
		...options,
		credentials: "same-origin",
		headers: { "Content-Type": "application/json", ...options.headers },
	});

	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(body.error ?? `Request failed with status ${response.status}`);
	}

	return response.json();
}

export const listBoardPosts = () => request<BoardPost[]>("/api/board");

export const createBoardPost = (content: string, imagesBase64?: string[]) =>
	request<BoardPost>("/api/board", {
		method: "POST",
		body: JSON.stringify({ content, ...(imagesBase64?.length ? { imagesBase64 } : {}) }),
	});

export const deleteBoardPost = (id: string) =>
	request<{ ok: true }>("/api/board/delete", {
		method: "POST",
		body: JSON.stringify({ id }),
	});

export const editBoardPost = (id: string, content: string, expectedUpdatedAt: string) =>
	request<Pick<BoardPost, "id" | "content" | "updatedAt">>("/api/board/edit", {
		method: "POST",
		body: JSON.stringify({ id, content, expectedUpdatedAt }),
	});

/** Keep the new UI hidden while a deployment still serves the older Worker. */
export const boardTextEditAvailable = () =>
	request<{ textEdit: boolean }>("/api/board/edit")
		.then(result => result.textEdit === true).catch(() => false);

/** 按同一個表情 = 取消，按別的 = 換掉；回傳整則貼文最新的表情彙總。 */
export const toggleBoardReaction = (postId: string, emoji: string) =>
	request<{ reactions: ReactionSummary[] }>("/api/board/react", {
		method: "POST",
		body: JSON.stringify({ postId, emoji }),
	});

export const createBoardComment = (postId: string, content: string, imagesBase64?: string[]) =>
	request<BoardComment>("/api/board/comment", {
		method: "POST",
		body: JSON.stringify({ postId, content, ...(imagesBase64?.length ? { imagesBase64 } : {}) }),
	});

export const deleteBoardComment = (postId: string, commentId: string) =>
	request<{ ok: true }>("/api/board/comment/delete", {
		method: "POST",
		body: JSON.stringify({ postId, commentId }),
	});

/** 行事曆。活動任何家人都能編輯/刪除（使用者要求「大家都可以編輯」）。 */
export interface EventInput {
	title: string;
	date: string;
	time: string | null;
	note: string;
	remindEmails: string[];
	remindAt: string | null;
}

export const listEvents = () => request<FamilyEvent[]>("/api/events");

export const createEvent = (data: EventInput) =>
	request<FamilyEvent>("/api/events", {
		method: "POST",
		body: JSON.stringify(data),
	});

export const updateEvent = (id: string, data: EventInput) =>
	request<FamilyEvent>("/api/events/update", {
		method: "POST",
		body: JSON.stringify({ id, ...data }),
	});

export const deleteEvent = (id: string) =>
	request<{ ok: true }>("/api/events/delete", {
		method: "POST",
		body: JSON.stringify({ id }),
	});

/** 已核准的家人名單（勾選提醒對象用）。 */
export const listFamily = () => request<FamilyMember[]>("/api/family");

export const listRecipes = () => request<Recipe[]>("/api/recipes");

export const createRecipe = (data: { name: string; category: string; recipeImageBase64?: string }) =>
	request<Recipe>("/api/recipes", {
		method: "POST",
		body: JSON.stringify(data),
	});

export const uploadRecipeImage = (id: string, photoBase64: string) =>
	request<Recipe>("/api/recipes/recipe-image", {
		method: "POST",
		body: JSON.stringify({ id, photoBase64 }),
	});

export const listOrders = () => request<Order[]>("/api/orders");

export const createOrder = (dishName: string) =>
	request<Order>("/api/orders", {
		method: "POST",
		body: JSON.stringify({ dishName }),
	});

export const deleteOrder = (id: string) =>
	request<{ ok: true }>("/api/orders/delete", {
		method: "POST",
		body: JSON.stringify({ id }),
	});

export const getProfile = () => request<Profile>("/api/profile");

export const updateProfile = (data: { nickname?: string; avatar?: "google" | { base64: string } },
) =>
	request<SessionResponse & { profile: { nickname: string | null; customAvatarUrl: string | null } }>("/api/profile", {
		method: "POST",
		body: JSON.stringify(data),
	});

export const subscribePush = (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
	request<{ ok: true }>("/api/push/subscribe", {
		method: "POST",
		body: JSON.stringify({ subscription }),
	});

export const unsubscribePush = (endpoint: string) =>
	request<{ ok: true }>("/api/push/unsubscribe", {
		method: "POST",
		body: JSON.stringify({ endpoint }),
	});

export const listPendingRequests = () =>
	request<PendingRequest[]>("/api/admin/pending");

export const approveRequest = (email: string) =>
	request<{ ok: true }>("/api/admin/approve", {
		method: "POST",
		body: JSON.stringify({ email }),
	});

export const denyRequest = (email: string) =>
	request<{ ok: true }>("/api/admin/deny", {
		method: "POST",
		body: JSON.stringify({ email }),
	});

