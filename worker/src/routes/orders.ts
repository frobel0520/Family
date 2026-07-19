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

/** 任何登入的家人都能刪除訂單項目（做完的菜手動清掉）。 */
export async function handleDeleteOrder(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	let body: { id?: string };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}
	if (!body.id || typeof body.id !== "string") {
		return jsonResponse({ error: "Missing 'id'" }, 400);
	}

	const orders = await readJsonArrayFile<Order>(env, "data/orders.json");
	const target = orders.find((o) => o.id === body.id);
	if (!target) {
		return jsonResponse({ error: "Order not found" }, 404);
	}

	await updateJsonArrayFile<Order>(
		env,
		"data/orders.json",
		(list) => list.filter((o) => o.id !== body.id),
		`orders: remove "${target.dishName}" by ${auth.session.name}`,
	);

	return jsonResponse({ ok: true });
}
