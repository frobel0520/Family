import { requireSession } from "../session";
import { readJsonArrayFile, updateJsonArrayFile } from "../github-contents";
import { jsonResponse } from "../response";

interface BoardPost {
	id: string;
	author: string;
	content: string;
	createdAt: string;
	updatedAt: string;
}

export async function handleListBoardPosts(_request: Request, env: Env): Promise<Response> {
	const posts = await readJsonArrayFile<BoardPost>(env, "data/board.json");
	posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return jsonResponse(posts);
}

export async function handleCreateBoardPost(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	let body: { content?: string };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}

	if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
		return jsonResponse({ error: "Missing 'content'" }, 400);
	}

	const now = new Date().toISOString();
	const newPost: BoardPost = {
		id: crypto.randomUUID(),
		author: auth.session.name,
		content: body.content.trim(),
		createdAt: now,
		updatedAt: now,
	};

	await updateJsonArrayFile<BoardPost>(
		env,
		"data/board.json",
		(posts) => [...posts, newPost],
		`board: new post by ${auth.session.name}`,
	);

	return jsonResponse(newPost, 201);
}

/** 刪留言：只有留言本人或擁有者（isOwner）可以刪。 */
export async function handleDeleteBoardPost(request: Request, env: Env): Promise<Response> {
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

	const posts = await readJsonArrayFile<BoardPost>(env, "data/board.json");
	const target = posts.find((p) => p.id === body.id);
	if (!target) {
		return jsonResponse({ error: "Post not found" }, 404);
	}
	if (!auth.session.isOwner && target.author !== auth.session.name) {
		return jsonResponse({ error: "只能刪除自己的留言" }, 403);
	}

	await updateJsonArrayFile<BoardPost>(
		env,
		"data/board.json",
		(list) => list.filter((p) => p.id !== body.id),
		`board: delete post by ${target.author} (removed by ${auth.session.name})`,
	);

	return jsonResponse({ ok: true });
}
