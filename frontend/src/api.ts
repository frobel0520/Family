import type { BoardComment, BoardPost, Order, PendingRequest, Profile, Recipe } from "./types";
import type { SessionResponse } from "./auth/types";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const response = await fetch(`${API_BASE}${path}`, {
		...options,
		headers: { "Content-Type": "application/json", ...options.headers },
	});

	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(body.error ?? `Request failed with status ${response.status}`);
	}

	return response.json();
}

function authHeaders(token: string): HeadersInit {
	return { Authorization: `Bearer ${token}` };
}

export const listBoardPosts = () => request<BoardPost[]>("/api/board");

export const createBoardPost = (token: string, content: string, imageBase64?: string) =>
	request<BoardPost>("/api/board", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ content, ...(imageBase64 ? { imageBase64 } : {}) }),
	});

export const deleteBoardPost = (token: string, id: string) =>
	request<{ ok: true }>("/api/board/delete", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ id }),
	});

export const createBoardComment = (token: string, postId: string, content: string) =>
	request<BoardComment>("/api/board/comment", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ postId, content }),
	});

export const deleteBoardComment = (token: string, postId: string, commentId: string) =>
	request<{ ok: true }>("/api/board/comment/delete", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ postId, commentId }),
	});

export const listRecipes = () => request<Recipe[]>("/api/recipes");

export const createRecipe = (token: string, data: { name: string; category: string; recipeImageBase64?: string }) =>
	request<Recipe>("/api/recipes", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify(data),
	});

export const uploadRecipeImage = (token: string, id: string, photoBase64: string) =>
	request<Recipe>("/api/recipes/recipe-image", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ id, photoBase64 }),
	});

export const listOrders = () => request<Order[]>("/api/orders");

export const createOrder = (token: string, dishName: string) =>
	request<Order>("/api/orders", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ dishName }),
	});

export const deleteOrder = (token: string, id: string) =>
	request<{ ok: true }>("/api/orders/delete", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ id }),
	});

export const getProfile = (token: string) => request<Profile>("/api/profile", { headers: authHeaders(token) });

export const updateProfile = (
	token: string,
	data: { nickname?: string; avatar?: "google" | { base64: string } },
) =>
	request<SessionResponse & { profile: { nickname: string | null; customAvatarUrl: string | null } }>("/api/profile", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify(data),
	});

export const subscribePush = (token: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
	request<{ ok: true }>("/api/push/subscribe", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ subscription }),
	});

export const unsubscribePush = (token: string, endpoint: string) =>
	request<{ ok: true }>("/api/push/unsubscribe", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ endpoint }),
	});

export const listPendingRequests = (token: string) =>
	request<PendingRequest[]>("/api/admin/pending", { headers: authHeaders(token) });

export const approveRequest = (token: string, email: string) =>
	request<{ ok: true }>("/api/admin/approve", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ email }),
	});

export const denyRequest = (token: string, email: string) =>
	request<{ ok: true }>("/api/admin/deny", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ email }),
	});
