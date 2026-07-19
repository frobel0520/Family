import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { createBoardPost, deleteBoardPost, listBoardPosts } from "../api";
import type { BoardPost } from "../types";
import { Pager } from "../components/Pager";

const PAGE_SIZE = 5;

function formatTime(iso: string): string {
	return new Date(iso).toLocaleString("zh-TW");
}

export function Board() {
	const { session } = useAuth();
	const [posts, setPosts] = useState<BoardPost[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [content, setContent] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [page, setPage] = useState(1);

	useEffect(() => {
		listBoardPosts()
			.then(setPosts)
			.catch((err: Error) => setLoadError(err.message))
			.finally(() => setLoading(false));
	}, []);

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

	async function handleDelete(post: BoardPost) {
		if (!session) return;
		if (!window.confirm("刪除這則留言？")) return;
		try {
			await deleteBoardPost(session.token, post.id);
			setPosts((prev) => prev.filter((p) => p.id !== post.id));
		} catch (err) {
			setLoadError((err as Error).message);
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
						placeholder="留言..."
						rows={3}
					/>
					<button type="submit" disabled={submitting || !content.trim()}>
						{submitting ? "送出中…" : "送出留言"}
					</button>
					{submitError && <p className="error">{submitError}</p>}
				</form>
			) : (
				<p className="hint">登入後才能留言。</p>
			)}

			{loading && <p>載入中…</p>}
			{loadError && <p className="error">載入失敗：{loadError}</p>}

			<ul className="board-list">
				{visiblePosts.map((post) => (
					<li key={post.id} className="board-post">
						<div className="board-post-meta">
							<strong>{post.author}</strong> · {formatTime(post.createdAt)}
						</div>
						<p>{post.content}</p>
						{session && (session.isOwner || post.author === session.name) && (
							<button
								type="button"
								className="delete-x"
								aria-label="刪除留言"
								onClick={() => handleDelete(post)}
							>
								✕
							</button>
						)}
					</li>
				))}
			</ul>
			{!loading && posts.length === 0 && <p className="hint">還沒有留言。</p>}

			<Pager page={page} totalPages={totalPages} onChange={setPage} />
		</div>
	);
}
