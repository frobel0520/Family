import { useEffect, useRef, useState } from "react";
import { fileToResizedJpegDataUrl } from "../fileToDataUrl";
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
// 超過這個數字才收合；收合時只露出最新的 COLLAPSED_VISIBLE_COUNT 則（像 Facebook）
const COLLAPSE_THRESHOLD = 3;
const COLLAPSED_VISIBLE_COUNT = 2;

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
	const [commentImages, setCommentImages] = useState<Record<string, string>>({}); // postId -> data URL
	const [commentingId, setCommentingId] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [attachedImage, setAttachedImage] = useState<string | null>(null); // data URL
	const [viewingImage, setViewingImage] = useState<string | null>(null); // 點圖放大
	const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
	const fileInput = useRef<HTMLInputElement>(null);
	const commentFileInputs = useRef<Record<string, HTMLInputElement | null>>({});

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
		if (!session || (!content.trim() && !attachedImage)) return;

		setSubmitting(true);
		setSubmitError(null);
		try {
			const newPost = await createBoardPost(session.token, content.trim(), attachedImage ?? undefined);
			setPosts((prev) => [newPost, ...prev]);
			setContent("");
			setAttachedImage(null);
			setPage(1); // new post sorts first — jump back to page 1 so it's visible
		} catch (err) {
			setSubmitError((err as Error).message);
		} finally {
			setSubmitting(false);
		}
	}

	async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = ""; // 同一張圖可以重選
		if (!file) return;
		setSubmitError(null);
		try {
			setAttachedImage(await fileToResizedJpegDataUrl(file, 1280));
		} catch (err) {
			setSubmitError((err as Error).message);
		}
	}

	async function onPickCommentImage(postId: string, e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		setSubmitError(null);
		try {
			const dataUrl = await fileToResizedJpegDataUrl(file, 1280);
			setCommentImages((prev) => ({ ...prev, [postId]: dataUrl }));
		} catch (err) {
			setSubmitError((err as Error).message);
		}
	}

	async function handleAddComment(post: BoardPost) {
		const draft = (commentDrafts[post.id] ?? "").trim();
		const image = commentImages[post.id];
		if (!session || (!draft && !image)) return;

		setCommentingId(post.id);
		setSubmitError(null);
		try {
			const newComment = await createBoardComment(session.token, post.id, draft, image);
			setPosts((prev) =>
				prev.map((p) => (p.id === post.id ? { ...p, comments: [...(p.comments ?? []), newComment] } : p)),
			);
			setCommentDrafts((prev) => ({ ...prev, [post.id]: "" }));
			setCommentImages((prev) => {
				const next = { ...prev };
				delete next[post.id];
				return next;
			});
			// 剛留言完，順便展開讓對方馬上看到自己剛送出的留言
			setExpandedComments((prev) => new Set(prev).add(post.id));
		} catch (err) {
			setSubmitError((err as Error).message);
		} finally {
			setCommentingId(null);
		}
	}

	function toggleExpanded(postId: string) {
		setExpandedComments((prev) => {
			const next = new Set(prev);
			if (next.has(postId)) next.delete(postId);
			else next.add(postId);
			return next;
		});
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
					{attachedImage && (
						<div className="board-image-preview">
							<img src={attachedImage} alt="附圖預覽" />
							<button type="button" className="delete-x" aria-label="移除附圖" onClick={() => setAttachedImage(null)}>
								✕
							</button>
						</div>
					)}
					<div className="board-form-actions">
						<button type="button" disabled={submitting} onClick={() => fileInput.current?.click()}>
							📷 {attachedImage ? "換一張圖" : "附上圖片"}
						</button>
						<input ref={fileInput} type="file" accept="image/*" style={{ display: "none" }} onChange={onPickImage} />
						<button type="submit" disabled={submitting || (!content.trim() && !attachedImage)}>
							{submitting ? "送出中…" : "發布"}
						</button>
					</div>
					{submitError && <p className="error">{submitError}</p>}
				</form>
			) : (
				<p className="hint">登入後才能發文與留言。</p>
			)}

			{loading && <p>載入中…</p>}
			{loadError && <p className="error">載入失敗：{loadError}</p>}

			<ul className="board-list">
				{visiblePosts.map((post) => {
					const comments = post.comments ?? [];
					const isExpanded = expandedComments.has(post.id);
					const shouldCollapse = comments.length > COLLAPSE_THRESHOLD && !isExpanded;
					const visibleComments = shouldCollapse ? comments.slice(-COLLAPSED_VISIBLE_COUNT) : comments;
					const hiddenCount = comments.length - visibleComments.length;
					const commentImage = commentImages[post.id];

					return (
						<li key={post.id} className="board-post">
							<div className="board-post-meta">
								<Avatar name={post.author} avatar={post.avatar} />
								<div className="board-post-meta-text">
									<strong>{post.author}</strong>
									<span className="board-post-time">{formatTime(post.createdAt)}</span>
								</div>
							</div>
							{post.content && <p>{post.content}</p>}
							{post.imageUrl && (
								<img
									className="board-post-image"
									src={post.imageUrl}
									alt="貼文附圖"
									loading="lazy"
									onClick={() => setViewingImage(post.imageUrl!)}
								/>
							)}
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
								{hiddenCount > 0 && (
									<button type="button" className="board-comments-toggle" onClick={() => toggleExpanded(post.id)}>
										查看全部 {comments.length} 則留言
									</button>
								)}

								{visibleComments.map((comment) => (
									<div key={comment.id} className="board-comment">
										<Avatar name={comment.author} avatar={comment.avatar} />
										<div className="board-comment-body">
											<div className="board-comment-meta">
												<strong>{comment.author}</strong>
												<span className="board-post-time">{formatTime(comment.createdAt)}</span>
											</div>
											{comment.content && <p>{comment.content}</p>}
											{comment.imageUrl && (
												<img
													className="board-comment-image"
													src={comment.imageUrl}
													alt="留言附圖"
													loading="lazy"
													onClick={() => setViewingImage(comment.imageUrl!)}
												/>
											)}
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

								{isExpanded && comments.length > COLLAPSE_THRESHOLD && (
									<button type="button" className="board-comments-toggle" onClick={() => toggleExpanded(post.id)}>
										收合留言
									</button>
								)}

								{session && (
									<div className="board-comment-form">
										{commentImage && (
											<div className="board-image-preview board-comment-image-preview">
												<img src={commentImage} alt="留言附圖預覽" />
												<button
													type="button"
													className="delete-x"
													aria-label="移除附圖"
													onClick={() =>
														setCommentImages((prev) => {
															const next = { ...prev };
															delete next[post.id];
															return next;
														})
													}
												>
													✕
												</button>
											</div>
										)}
										<div className="board-comment-form-row">
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
												className="board-comment-image-btn"
												aria-label="附上圖片"
												onClick={() => commentFileInputs.current[post.id]?.click()}
											>
												📷
											</button>
											<input
												ref={(el) => {
													commentFileInputs.current[post.id] = el;
												}}
												type="file"
												accept="image/*"
												style={{ display: "none" }}
												onChange={(e) => onPickCommentImage(post.id, e)}
											/>
											<button
												type="button"
												disabled={
													commentingId === post.id || (!(commentDrafts[post.id] ?? "").trim() && !commentImage)
												}
												onClick={() => handleAddComment(post)}
											>
												{commentingId === post.id ? "…" : "留言"}
											</button>
										</div>
									</div>
								)}
							</div>
						</li>
					);
				})}
			</ul>
			{!loading && posts.length === 0 && <p className="hint">還沒有貼文。</p>}

			<Pager page={page} totalPages={totalPages} onChange={setPage} />

			{viewingImage && (
				<div className="recipe-modal-backdrop" onClick={() => setViewingImage(null)}>
					<img className="board-image-full" src={viewingImage} alt="附圖" onClick={(e) => e.stopPropagation()} />
				</div>
			)}

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
