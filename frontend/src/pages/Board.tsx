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
import { formatTime } from "../formatTime";

const PAGE_SIZE = 5;
// 超過這個數字才收合；收合時只露出最新的 COLLAPSED_VISIBLE_COUNT 則（像 Facebook）
const COLLAPSE_THRESHOLD = 3;
const COLLAPSED_VISIBLE_COUNT = 2;
// 一則貼文/留言最多幾張圖（Worker 端也會擋，這裡是為了先給使用者提示）
const MAX_IMAGES = 9;

type PendingDelete =
	| { kind: "post"; post: BoardPost }
	| { kind: "comment"; postId: string; comment: BoardComment };

/** 燈箱看的是「某一組圖的第幾張」，這樣多張圖可以左右翻。 */
type ViewingImages = { urls: string[]; index: number };

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
	const [commentImages, setCommentImages] = useState<Record<string, string[]>>({}); // postId -> data URLs
	const [commentingId, setCommentingId] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [attachedImages, setAttachedImages] = useState<string[]>([]); // data URLs
	const [viewing, setViewing] = useState<ViewingImages | null>(null); // 點圖放大
	const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
	const fileInput = useRef<HTMLInputElement>(null);
	const commentFileInputs = useRef<Record<string, HTMLInputElement | null>>({});

	useEffect(() => {
		if (!session) {
			setLoading(false);
			return;
		}
		setLoading(true);
		listBoardPosts(session.token)
			.then(setPosts)
			.catch((err: Error) => setLoadError(err.message))
			.finally(() => setLoading(false));
	}, [session?.token]);

	// 燈箱開著時用鍵盤左右翻圖／Esc 關閉（桌機用；手機還是點兩側的箭頭）
	useEffect(() => {
		if (!viewing) return;
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") setViewing(null);
			else if (e.key === "ArrowRight") stepViewing(1);
			else if (e.key === "ArrowLeft") stepViewing(-1);
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [viewing]);

	/** 在同一組圖裡前後翻（頭尾循環）。 */
	function stepViewing(delta: number) {
		setViewing((prev) => {
			if (!prev) return prev;
			const count = prev.urls.length;
			return { ...prev, index: (prev.index + delta + count) % count };
		});
	}

	function canDelete(target: { author: string; authorEmail?: string }): boolean {
		if (!session) return false;
		if (session.isOwner) return true;
		// 新資料用 email 比對（暱稱可以改，名字比對會失效）；舊資料退回名字比對
		if (target.authorEmail && session.email) return target.authorEmail === session.email;
		return target.author === session.name;
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!session || (!content.trim() && attachedImages.length === 0)) return;

		setSubmitting(true);
		setSubmitError(null);
		try {
			const newPost = await createBoardPost(session.token, content.trim(), attachedImages);
			setPosts((prev) => [newPost, ...prev]);
			setContent("");
			setAttachedImages([]);
			setPage(1); // new post sorts first — jump back to page 1 so it's visible
		} catch (err) {
			setSubmitError((err as Error).message);
		} finally {
			setSubmitting(false);
		}
	}

	/** 選到的檔案一起縮圖，接在已選的後面（可以分幾次選）；超過上限就擋下來。 */
	async function resizePicked(files: File[], alreadyPicked: number): Promise<string[] | null> {
		if (alreadyPicked + files.length > MAX_IMAGES) {
			setSubmitError(`一次最多 ${MAX_IMAGES} 張圖片`);
			return null;
		}
		setSubmitError(null);
		try {
			return await Promise.all(files.map((file) => fileToResizedJpegDataUrl(file, 1280)));
		} catch (err) {
			setSubmitError((err as Error).message);
			return null;
		}
	}

	async function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files ?? []);
		e.target.value = ""; // 同一張圖可以重選
		if (files.length === 0) return;
		const dataUrls = await resizePicked(files, attachedImages.length);
		if (dataUrls) setAttachedImages((prev) => [...prev, ...dataUrls]);
	}

	async function onPickCommentImages(postId: string, e: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files ?? []);
		e.target.value = "";
		if (files.length === 0) return;
		const dataUrls = await resizePicked(files, commentImages[postId]?.length ?? 0);
		if (dataUrls) setCommentImages((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), ...dataUrls] }));
	}

	function removeCommentImage(postId: string, index: number) {
		setCommentImages((prev) => {
			const next = { ...prev };
			const remaining = (next[postId] ?? []).filter((_, i) => i !== index);
			if (remaining.length) next[postId] = remaining;
			else delete next[postId];
			return next;
		});
	}

	async function handleAddComment(post: BoardPost) {
		const draft = (commentDrafts[post.id] ?? "").trim();
		const images = commentImages[post.id] ?? [];
		if (!session || (!draft && images.length === 0)) return;

		setCommentingId(post.id);
		setSubmitError(null);
		try {
			const newComment = await createBoardComment(session.token, post.id, draft, images);
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
					{attachedImages.length > 0 && (
						<div className="board-image-previews">
							{attachedImages.map((dataUrl, index) => (
								<div key={index} className="board-image-preview">
									<img src={dataUrl} alt={`附圖預覽 ${index + 1}`} />
									<button
										type="button"
										className="delete-x"
										aria-label={`移除第 ${index + 1} 張附圖`}
										onClick={() => setAttachedImages((prev) => prev.filter((_, i) => i !== index))}
									>
										✕
									</button>
								</div>
							))}
						</div>
					)}
					<div className="board-form-actions">
						<button
							type="button"
							disabled={submitting || attachedImages.length >= MAX_IMAGES}
							onClick={() => fileInput.current?.click()}
						>
							📷 {attachedImages.length > 0 ? `再加圖片（${attachedImages.length}/${MAX_IMAGES}）` : "附上圖片"}
						</button>
						<input
							ref={fileInput}
							type="file"
							accept="image/*"
							multiple
							style={{ display: "none" }}
							onChange={onPickImages}
						/>
						<button type="submit" disabled={submitting || (!content.trim() && attachedImages.length === 0)}>
							{submitting ? "送出中…" : "發布"}
						</button>
					</div>
					{submitError && <p className="error">{submitError}</p>}
				</form>
			) : (
				<p className="hint">請先登入才能查看佈告欄內容（只有家人看得到）。</p>
			)}

			{session && loading && <p>載入中…</p>}
			{session && loadError && <p className="error">載入失敗：{loadError}</p>}

			<ul className="board-list">
				{session &&
					visiblePosts.map((post) => {
					const comments = post.comments ?? [];
					const isExpanded = expandedComments.has(post.id);
					const shouldCollapse = comments.length > COLLAPSE_THRESHOLD && !isExpanded;
					const visibleComments = shouldCollapse ? comments.slice(-COLLAPSED_VISIBLE_COUNT) : comments;
					const hiddenCount = comments.length - visibleComments.length;
					const draftImages = commentImages[post.id] ?? [];
					const postImages = post.imageUrls ?? [];

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
							{postImages.length > 0 && (
								<div className={`board-post-images count-${Math.min(postImages.length, 3)}`}>
									{postImages.map((url, index) => (
										<img
											key={url}
											className="board-post-image"
											src={url}
											alt={`貼文附圖 ${index + 1}`}
											loading="lazy"
											onClick={() => setViewing({ urls: postImages, index })}
										/>
									))}
								</div>
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
											{(comment.imageUrls ?? []).length > 0 && (
												<div className="board-comment-images">
													{comment.imageUrls!.map((url, index) => (
														<img
															key={url}
															className="board-comment-image"
															src={url}
															alt={`留言附圖 ${index + 1}`}
															loading="lazy"
															onClick={() => setViewing({ urls: comment.imageUrls!, index })}
														/>
													))}
												</div>
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
										{draftImages.length > 0 && (
											<div className="board-image-previews">
												{draftImages.map((dataUrl, index) => (
													<div key={index} className="board-image-preview board-comment-image-preview">
														<img src={dataUrl} alt={`留言附圖預覽 ${index + 1}`} />
														<button
															type="button"
															className="delete-x"
															aria-label={`移除第 ${index + 1} 張附圖`}
															onClick={() => removeCommentImage(post.id, index)}
														>
															✕
														</button>
													</div>
												))}
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
												disabled={draftImages.length >= MAX_IMAGES}
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
												multiple
												style={{ display: "none" }}
												onChange={(e) => onPickCommentImages(post.id, e)}
											/>
											<button
												type="button"
												disabled={
													commentingId === post.id ||
													(!(commentDrafts[post.id] ?? "").trim() && draftImages.length === 0)
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
			{session && !loading && posts.length === 0 && <p className="hint">還沒有貼文。</p>}

			{session && <Pager page={page} totalPages={totalPages} onChange={setPage} />}

			{viewing && (
				<div className="recipe-modal-backdrop" onClick={() => setViewing(null)}>
					<img
						className="board-image-full"
						src={viewing.urls[viewing.index]}
						alt={`附圖 ${viewing.index + 1}`}
						onClick={(e) => e.stopPropagation()}
					/>
					{viewing.urls.length > 1 && (
						<>
							<button
								type="button"
								className="board-lightbox-nav prev"
								aria-label="上一張"
								onClick={(e) => {
									e.stopPropagation();
									stepViewing(-1);
								}}
							>
								‹
							</button>
							<button
								type="button"
								className="board-lightbox-nav next"
								aria-label="下一張"
								onClick={(e) => {
									e.stopPropagation();
									stepViewing(1);
								}}
							>
								›
							</button>
							<span className="board-lightbox-counter">
								{viewing.index + 1} / {viewing.urls.length}
							</span>
						</>
					)}
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
