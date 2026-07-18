import { requireSession } from "../session";
import { updateJsonArrayFile } from "../github-contents";
import { jsonResponse } from "../response";

interface BoardPost {
	id: string;
	author: string;
	content: string;
	createdAt: string;
	updatedAt: string;
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
		author: auth.session.sub,
		content: body.content.trim(),
		createdAt: now,
		updatedAt: now,
	};

	await updateJsonArrayFile<BoardPost>(
		env,
		"data/board.json",
		(posts) => [...posts, newPost],
		`board: new post by ${auth.session.sub}`,
	);

	return jsonResponse(newPost, 201);
}
