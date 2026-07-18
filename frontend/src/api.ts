import type { BoardPost, Order, PendingRequest, Recipe } from "./types";

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

export const createBoardPost = (token: string, content: string) =>
	request<BoardPost>("/api/board", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ content }),
	});

export const listRecipes = () => request<Recipe[]>("/api/recipes");

export const createRecipe = (token: string, data: { name: string; category: string; photoBase64: string }) =>
	request<Recipe>("/api/recipes", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify(data),
	});

export const listOrders = () => request<Order[]>("/api/orders");

export const createOrder = (token: string, dishName: string) =>
	request<Order>("/api/orders", {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ dishName }),
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
