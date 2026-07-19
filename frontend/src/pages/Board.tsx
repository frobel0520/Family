import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
	createBoardComment,
	createBoardPost,
	deleteBoardComment,
	deleteBoardPost,
	listBoardPosts,
} from "../api";
import type { BoardComment, BoardPost } from "../types";
import { Pager } from "../components/Pager";
import { Avatar } from "../components/Avatar";
import { ConfirmDialog } from "../components/ConfirmDialog";

const PAGE_SIZE = 5;

function formatTime(iso: string): string {
	return new Date(iso).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" });
}

type PendingDelete =
	| { kind: "post"; post: BoardPost }
	| { kind: "comment"; postId: string; comment: BoardComment };

export function Board() {
	const { session } = useAuth();
	const [posts, setPosts] = useState<BoardPost[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [content, setContent] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
	const [commentingId, setCommentingId] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
	const [deleting, setDeleting] = useState(false);

	useEffect(() => {
		listBoardPosts()
			.then(setPosts)
			.catch((err: Error) => setLoadError(err.message))
			.finally(() => setLoading(false));
	}, []);

	function canDelete(target: { author: string; authorEmail?: string }): boolean {
		if (!session) return false;
		if (session.isOwner) return true;
		// 新資料用 email 比對（暱稱可以改，名字比對會失效）；舊資料退回名字比對
		if (target.authorEmail && session.email) return target.authorEmail === session.email;
		return target.author === session.name;
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!session || !content.trim()) return;

		setSubmitting(true);
		setSubmitError(null);
		try {
			const newPost = await createBoardPost(session.token, content.trim());
			setPosts((prev) => [newPost, ...prev]);
			setContent("");
			setPage(1); // new post sorts first — jump back to page 1 so it's visible
		} catch (err) {
			setSubmitError((err as Error).message);
		} finally {
			setSubmitting(false);
		}
	}

	async function handleAddComment(post: BoardPost) {
		const draft = (commentDrafts[post.id] ?? "").trim();
		if (!session || !draft) return;

		setCommentingId(post.id);
		setSubmitError(null);
		try {
			const newComment = await createBoardComment(session.token, post.id, draft);
			setPosts((prev) =>
				prev.map((p) => (p.id === post.id ? { ...p, comments: [...(p.comments ?? []), newComment] } : p)),
			);
			setCommentDrafts((prev) => ({ ...prev, [post.id]: "" }));
		} catch (err) {
			setSubmitError((err as Error).message);
		} finally {
			setCommentingId(null);
		}
	}

	async function confirmDelete() {
		if (!session || !pendingDelete) return;
		setDeleting(true);
		try {
			if (pendingDelete.kind === "post") {
				await deleteBoardPost(session.token, pendingDelete.post.id);
				setPosts((prev) => prev.filter((p) => p.id !== pendingDelete.post.id));
			} else {
				const { postId, comment } = pendingDelete;
				await deleteBoardComment(session.token, postId, comment.id);
				setPosts((prev) =>
					prev.map((p) =>
						p.id === postId ? { ...p, comments: (p.comments ?? []).filter((c) => c.id !== comment.id) } : p,
					),
				);
			}
			setPendingDelete(null);
		} catch (err) {
			setLoadError((err as Error).message);
			setPendingDelete(null);
		} finally {
			setDeleting(false);
		}
	}

	const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
	const visiblePosts = posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	return (
		<div className="page">
			<h1>佈告欄</h1>

			{session ? (
				<form className="board-form" onSubmit={handleSubmit}>
					<textarea
						value={content}
						onChange={(e) => setContent(e.target.value)}
						placeholder="想說點什麼..."
						rows={3}
					/>
					<button type="submit" disabled={submitting || !content.trim()}>
						{submitting ? "送出中…" : "發布"}
					</button>
					{submitError && <p className="error">{submitError}</p>}
				</form>
			) : (
				<p className="hint">登入後才能發文與留言。</p>
			)}

			{loading && <p>載入中…</p>}
			{loadError && <p className="error">載入失敗：{loadError}</p>}

			<ul className="board-list">
				{visiblePosts.map((post) => (
					<li key={post.id} className="board-post">
						<div className="board-post-meta">
							<Avatar name={post.author} avatar={post.avatar} />
							<div className="board-post-meta-text">
								<strong>{post.author}</strong>
								<span className="board-post-time">{formatTime(post.createdAt)}</span>
							</div>
						</div>
						<p>{post.content}</p>
						{canDelete(post) && (
							<button
								type="button"
								className="delete-x"
								aria-label="刪除貼文"
								onClick={() => setPendingDelete({ kind: "post", post })}
							>
								✕
							</button>
						)}

						<div className="board-comments">
							{(post.comments ?? []).map((comment) => (
								<div key={comment.id} className="board-comment">
									<Avatar name={comment.author} avatar={comment.avatar} />
									<div className="board-comment-body">
										<div className="board-comment-meta">
											<strong>{comment.author}</strong>
											<span className="board-post-time">{formatTime(comment.createdAt)}</span>
										</div>
										<p>{comment.content}</p>
									</div>
									{canDelete(comment) && (
										<button
											type="button"
											className="delete-x"
											aria-label="刪除留言"
											onClick={() => setPendingDelete({ kind: "comment", postId: post.id, comment })}
										>
											✕
										</button>
									)}
								</div>
							))}

							{session && (
								<div className="board-comment-form">
									<input
										type="text"
										value={commentDrafts[post.id] ?? ""}
										onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
										placeholder="留言..."
										onKeyDown={(e) => {
											if (e.key === "Enter" && !e.nativeEvent.isComposing) {
												e.preventDefault();
												void handleAddComment(post);
											}
										}}
									/>
									<button
										type="button"
										disabled={commentingId === post.id || !(commentDrafts[post.id] ?? "").trim()}
										onClick={() => handleAddComment(post)}
									>
										{commentingId === post.id ? "…" : "留言"}
									</button>
								</div>
							)}
						</div>
					</li>
				))}
			</ul>
			{!loading && posts.length === 0 && <p className="hint">還沒有貼文。</p>}

			<Pager page={page} totalPages={totalPages} onChange={setPage} />

			{pendingDelete && (
				<ConfirmDialog
					message={
						pendingDelete.kind === "post"
							? "確定要刪除這則貼文嗎？貼文底下的留言也會一起刪除。"
							: "確定要刪除這則留言嗎？"
					}
					busy={deleting}
					onConfirm={confirmDelete}
					onCancel={() => setPendingDelete(null)}
				/>
			)}
		</div>
	);
}
