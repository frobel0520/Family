import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { createBoardPost, listBoardPosts } from "../api";
import type { BoardPost } from "../types";

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
		} catch (err) {
			setSubmitError((err as Error).message);
		} finally {
			setSubmitting(false);
		}
	}

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
				{posts.map((post) => (
					<li key={post.id} className="board-post">
						<div className="board-post-meta">
							<strong>{post.author}</strong> · {formatTime(post.createdAt)}
						</div>
						<p>{post.content}</p>
					</li>
				))}
			</ul>
			{!loading && posts.length === 0 && <p className="hint">還沒有留言。</p>}
		</div>
	);
}
