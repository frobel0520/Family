import { requireSession } from "../session";
import { readJsonArrayFile, updateJsonArrayFile } from "../github-contents";
import { jsonResponse } from "../response";

interface Order {
	id: string;
	dishName: string;
	createdAt: string;
}

export async function handleListOrders(_request: Request, env: Env): Promise<Response> {
	const orders = await readJsonArrayFile<Order>(env, "data/orders.json");
	orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return jsonResponse(orders);
}

export async function handleCreateOrder(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	let body: { dishName?: string };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}

	if (!body.dishName || typeof body.dishName !== "string" || !body.dishName.trim()) {
		return jsonResponse({ error: "Missing 'dishName'" }, 400);
	}

	const newOrder: Order = {
		id: crypto.randomUUID(),
		dishName: body.dishName.trim(),
		createdAt: new Date().toISOString(),
	};

	await updateJsonArrayFile<Order>(
		env,
		"data/orders.json",
		(orders) => [...orders, newOrder],
		`orders: add "${newOrder.dishName}"`,
	);

	return jsonResponse(newOrder, 201);
}
