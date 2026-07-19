import { requireSession } from "../session";
import { readJsonArrayFile, updateJsonArrayFile } from "../github-contents";
import { jsonResponse } from "../response";
import { excerpt, notifyAll } from "../notify";

interface BoardComment {
	id: string;
	author: string;
	authorEmail?: string; // 刪除權限用 email 比對（暱稱可改，名字比對會失效）；舊資料沒有
	avatar?: string;
	content: string;
	createdAt: string;
}

interface BoardPost {
	id: string;
	author: string;
	authorEmail?: string; // 同上；舊資料沒有這個欄位，fallback 比對名字
	avatar?: string; // 舊資料沒有這個欄位，前端會用名字首字當替代頭像
	content: string;
	createdAt: string;
	updatedAt: string;
	comments?: BoardComment[];
}

/** 刪除權限：擁有者一律可以；有 authorEmail 用 email 比對，舊資料退回名字比對。 */
function canDelete(session: { isOwner: boolean; email: string; name: string }, target: { author: string; authorEmail?: string }): boolean {
	if (session.isOwner) return true;
	if (target.authorEmail) return target.authorEmail === session.email.toLowerCase();
	return target.author === session.name;
}

export async function handleListBoardPosts(_request: Request, env: Env): Promise<Response> {
	const posts = await readJsonArrayFile<BoardPost>(env, "data/board.json");
	posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return jsonResponse(posts);
}

export async function handleCreateBoardPost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
		authorEmail: auth.session.email.toLowerCase(),
		avatar: auth.session.avatar,
		content: body.content.trim(),
		createdAt: now,
		updatedAt: now,
		comments: [],
	};

	await updateJsonArrayFile<BoardPost>(
		env,
		"data/board.json",
		(posts) => [...posts, newPost],
		`board: new post by ${auth.session.name}`,
	);

	ctx.waitUntil(
		notifyAll(
			env,
			{
				title: `📌 ${auth.session.name} 發了新貼文`,
				body: excerpt(newPost.content),
				url: "/Family/#/board",
				tag: "board",
				icon: auth.session.avatar,
			},
			auth.session.email,
		),
	);

	return jsonResponse(newPost, 201);
}

/** 刪貼文：只有貼文本人或擁有者（isOwner）可以刪。 */
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
	if (!canDelete(auth.session, target)) {
		return jsonResponse({ error: "只能刪除自己的貼文" }, 403);
	}

	await updateJsonArrayFile<BoardPost>(
		env,
		"data/board.json",
		(list) => list.filter((p) => p.id !== body.id),
		`board: delete post by ${target.author} (removed by ${auth.session.name})`,
	);

	return jsonResponse({ ok: true });
}

/** 在貼文底下留言。 */
export async function handleCreateBoardComment(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	let body: { postId?: string; content?: string };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}
	if (!body.postId || typeof body.postId !== "string") {
		return jsonResponse({ error: "Missing 'postId'" }, 400);
	}
	if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
		return jsonResponse({ error: "Missing 'content'" }, 400);
	}
	const postId = body.postId;

	const newComment: BoardComment = {
		id: crypto.randomUUID(),
		author: auth.session.name,
		authorEmail: auth.session.email.toLowerCase(),
		avatar: auth.session.avatar,
		content: body.content.trim(),
		createdAt: new Date().toISOString(),
	};

	let found = false;
	await updateJsonArrayFile<BoardPost>(
		env,
		"data/board.json",
		(posts) =>
			posts.map((p) => {
				if (p.id !== postId) return p;
				found = true;
				return { ...p, comments: [...(p.comments ?? []), newComment] };
			}),
		`board: comment by ${auth.session.name}`,
	);
	if (!found) {
		return jsonResponse({ error: "Post not found" }, 404);
	}

	ctx.waitUntil(
		notifyAll(
			env,
			{
				title: `💬 ${auth.session.name} 在佈告欄留言`,
				body: excerpt(newComment.content),
				url: "/Family/#/board",
				tag: "board",
				icon: auth.session.avatar,
			},
			auth.session.email,
		),
	);

	return jsonResponse(newComment, 201);
}

/** 刪留言：只有留言本人或擁有者（isOwner）可以刪。 */
export async function handleDeleteBoardComment(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	let body: { postId?: string; commentId?: string };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}
	if (!body.postId || typeof body.postId !== "string" || !body.commentId || typeof body.commentId !== "string") {
		return jsonResponse({ error: "Missing 'postId' or 'commentId'" }, 400);
	}
	const { postId, commentId } = body;

	const posts = await readJsonArrayFile<BoardPost>(env, "data/board.json");
	const post = posts.find((p) => p.id === postId);
	if (!post) {
		return jsonResponse({ error: "Post not found" }, 404);
	}
	const target = (post.comments ?? []).find((c) => c.id === commentId);
	if (!target) {
		return jsonResponse({ error: "Comment not found" }, 404);
	}
	if (!canDelete(auth.session, target)) {
		return jsonResponse({ error: "只能刪除自己的留言" }, 403);
	}

	await updateJsonArrayFile<BoardPost>(
		env,
		"data/board.json",
		(list) =>
			list.map((p) =>
				p.id === postId ? { ...p, comments: (p.comments ?? []).filter((c) => c.id !== commentId) } : p,
			),
		`board: delete comment by ${target.author} (removed by ${auth.session.name})`,
	);

	return jsonResponse({ ok: true });
}
