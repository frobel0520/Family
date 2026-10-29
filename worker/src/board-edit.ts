/** Text edits require a stable author identity; display names are not identities. */
export interface EditableBoardPost {
	id: string;
	authorEmail?: string;
	content: string;
	updatedAt: string;
	imagePath?: string | null;
	imagePaths?: string[];
}

export class BoardEditError extends Error {
	constructor(message: string, public status: number) { super(message); }
}

export function editBoardPost<T extends EditableBoardPost>(
	posts: T[], email: string, input: { id: string; content: string; expectedUpdatedAt: string }, now = Date.now(),
): T[] {
	const target = posts.find(post => post.id === input.id);
	if (!target) throw new BoardEditError("貼文不存在", 404);
	if (!target.authorEmail || target.authorEmail.toLowerCase() !== email.toLowerCase()) {
		throw new BoardEditError("只能編輯自己的貼文；舊貼文若無作者帳號，暫不開放編輯", 403);
	}
	if (target.updatedAt !== input.expectedUpdatedAt) {
		throw new BoardEditError("貼文已更新，請重新載入後再編輯；你的草稿仍保留在此", 409);
	}
	const content = input.content.trim();
	if (!content && !target.imagePath && !target.imagePaths?.length) {
		throw new BoardEditError("貼文要有文字或圖片", 400);
	}
	if (content.length > 5000) throw new BoardEditError("貼文最多 5000 字", 400);
	// Keep the version distinct even for two edits within one clock millisecond.
	const updatedAt = new Date(Math.max(now, (Date.parse(target.updatedAt) || 0) + 1)).toISOString();
	return posts.map(post => post.id === target.id ? { ...post, content, updatedAt } : post);
}
