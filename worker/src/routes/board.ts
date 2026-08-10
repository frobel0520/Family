import { requireSession } from "../session";
import { readJsonArrayFile, updateJsonArrayFile, putBase64File } from "../github-contents";
import { jsonResponse } from "../response";
import { excerpt, notifyAll } from "../notify";
import { imageProxyUrl } from "../image-url";
import { avatarForStoredAuthor, listProfiles, type Profile } from "../profiles";

/** 一則貼文/留言最多幾張圖（前端也擋一次，這裡是後端保險）。 */
const MAX_IMAGES = 9;

interface BoardComment {
	id: string;
	author: string;
	authorEmail?: string; // 刪除權限用 email 比對（暱稱可改，名字比對會失效）；舊資料沒有
	avatar?: string;
	content: string; // 有附圖時可以是空字串
	imagePath?: string | null; // 舊資料的單張附圖路徑；新資料改用 imagePaths
	imagePaths?: string[]; // 附圖的 repo 相對路徑（images/board/comments/<id>-<n>.jpg）；回前端轉簽章網址
	createdAt: string;
}

interface BoardPost {
	id: string;
	author: string;
	authorEmail?: string; // 同上；舊資料沒有這個欄位，fallback 比對名字
	avatar?: string; // 舊資料沒有這個欄位，前端會用名字首字當替代頭像
	content: string; // 有附圖時可以是空字串
	imagePath?: string | null; // 舊資料的單張附圖路徑；新資料改用 imagePaths
	imagePaths?: string[]; // 附圖的 repo 相對路徑（images/board/<id>-<n>.jpg）；回前端轉簽章網址
	createdAt: string;
	updatedAt: string;
	comments?: BoardComment[];
}

/** 舊資料只有單張 `imagePath`，新資料是 `imagePaths`；一律攤成陣列。 */
function imagePathsOf(item: { imagePath?: string | null; imagePaths?: string[] }): string[] {
	if (item.imagePaths?.length) return item.imagePaths;
	return item.imagePath ? [item.imagePath] : [];
}

async function imageUrlsOf(
	request: Request,
	env: Env,
	item: { imagePath?: string | null; imagePaths?: string[] },
): Promise<string[]> {
	const urls = await Promise.all(imagePathsOf(item).map((p) => imageProxyUrl(request, p, env.JWT_SECRET)));
	return urls.filter((u): u is string => Boolean(u));
}

/**
 * 存的是 repo 相對路徑，回前端轉成登入者才能用的簽章轉發網址（貼文/留言都不可改圖，不用版本參數）。
 * `imageUrl` 只是為了相容還沒重新載入的舊前端（多張圖時給第一張），新前端只看 `imageUrls`。
 */
async function withImageUrl(
	request: Request,
	env: Env,
	post: BoardPost,
	profiles: Profile[],
): Promise<
	BoardPost & {
		imageUrl: string | null;
		imageUrls: string[];
		comments?: (BoardComment & { imageUrl: string | null; imageUrls: string[] })[];
	}
> {
	const imageUrls = await imageUrlsOf(request, env, post);
	const avatar = await avatarForStoredAuthor(request, env, profiles, {
		authorEmail: post.authorEmail,
		authorName: post.author,
		avatar: post.avatar,
	});
	return {
		...post,
		avatar: avatar ?? undefined,
		imageUrl: imageUrls[0] ?? null,
		imageUrls,
		comments: post.comments
			? await Promise.all(
					post.comments.map(async (c) => {
						const commentUrls = await imageUrlsOf(request, env, c);
						const commentAvatar = await avatarForStoredAuthor(request, env, profiles, {
							authorEmail: c.authorEmail,
							authorName: c.author,
							avatar: c.avatar,
						});
						return { ...c, avatar: commentAvatar ?? undefined, imageUrl: commentUrls[0] ?? null, imageUrls: commentUrls };
					}),
				)
			: undefined,
	};
}

/**
 * 從 request body 收圖：新前端送 `imagesBase64` 陣列，舊前端送單張 `imageBase64`（相容）。
 * 超過 MAX_IMAGES 直接截掉多的。
 */
function collectImages(body: { imageBase64?: string; imagesBase64?: unknown }): string[] {
	const list = Array.isArray(body.imagesBase64)
		? body.imagesBase64.filter((x): x is string => typeof x === "string" && x.length > 0)
		: typeof body.imageBase64 === "string" && body.imageBase64.length > 0
			? [body.imageBase64]
			: [];
	return list.slice(0, MAX_IMAGES);
}

/** 依序把圖片存進 repo（一張一個 commit）。任何一張失敗就丟錯，呼叫端不會寫 board.json。 */
async function putImages(env: Env, images: string[], pathFor: (index: number) => string, message: string): Promise<string[]> {
	const paths: string[] = [];
	for (const [index, image] of images.entries()) {
		const path = pathFor(index);
		await putBase64File(env, path, image.replace(/^data:.*;base64,/s, ""), message);
		paths.push(path);
	}
	return paths;
}

/** 通知內文：沒文字時用照片張數描述。 */
function imageSummary(count: number): string {
	return count > 1 ? `📷 傳了 ${count} 張照片` : "📷 傳了一張照片";
}

/** 刪除權限：擁有者一律可以；有 authorEmail 用 email 比對，舊資料退回名字比對。 */
function canDelete(session: { isOwner: boolean; email: string; name: string }, target: { author: string; authorEmail?: string }): boolean {
	if (session.isOwner) return true;
	if (target.authorEmail) return target.authorEmail === session.email.toLowerCase();
	return target.author === session.name;
}

export async function handleListBoardPosts(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	const [posts, profiles] = await Promise.all([
		readJsonArrayFile<BoardPost>(env, "data/board.json"),
		listProfiles(env),
	]);
	posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return jsonResponse(await Promise.all(posts.map((p) => withImageUrl(request, env, p, profiles))));
}

export async function handleCreateBoardPost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	let body: { content?: string; imageBase64?: string; imagesBase64?: unknown };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}

	const content = typeof body.content === "string" ? body.content.trim() : "";
	const images = collectImages(body);
	if (!content && images.length === 0) {
		return jsonResponse({ error: "貼文要有文字或圖片" }, 400);
	}

	const postId = crypto.randomUUID();

	// 先傳圖，圖傳失敗就整篇不發（不會出現「有貼文沒圖」的半套狀態）
	const imagePaths = await putImages(
		env,
		images,
		(i) => `images/board/${postId}-${i + 1}.jpg`,
		`board: image for post by ${auth.session.name}`,
	);

	const now = new Date().toISOString();
	const newPost: BoardPost = {
		id: postId,
		author: auth.session.name,
		authorEmail: auth.session.email.toLowerCase(),
		avatar: auth.session.avatar,
		content,
		imagePaths,
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
				body: content ? excerpt(content) : imageSummary(images.length),
				url: "/Family/#/board",
				tag: "board",
				icon: auth.session.avatar,
			},
			auth.session.email,
		),
	);

	return jsonResponse(await withImageUrl(request, env, newPost, await listProfiles(env)), 201);
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

	let body: { postId?: string; content?: string; imageBase64?: string; imagesBase64?: unknown };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}
	if (!body.postId || typeof body.postId !== "string") {
		return jsonResponse({ error: "Missing 'postId'" }, 400);
	}
	const content = typeof body.content === "string" ? body.content.trim() : "";
	const images = collectImages(body);
	if (!content && images.length === 0) {
		return jsonResponse({ error: "留言要有文字或圖片" }, 400);
	}
	const postId = body.postId;
	const commentId = crypto.randomUUID();

	// 先傳圖，圖傳失敗就整則留言不送出
	const imagePaths = await putImages(
		env,
		images,
		(i) => `images/board/comments/${commentId}-${i + 1}.jpg`,
		`board: comment image by ${auth.session.name}`,
	);

	const newComment: BoardComment = {
		id: commentId,
		author: auth.session.name,
		authorEmail: auth.session.email.toLowerCase(),
		avatar: auth.session.avatar,
		content,
		imagePaths,
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
				body: content ? excerpt(content) : imageSummary(images.length),
				url: "/Family/#/board",
				tag: "board",
				icon: auth.session.avatar,
			},
			auth.session.email,
		),
	);

	const commentUrls = await imageUrlsOf(request, env, newComment);
	return jsonResponse({ ...newComment, imageUrl: commentUrls[0] ?? null, imageUrls: commentUrls }, 201);
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
