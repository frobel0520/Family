import { describe, expect, it } from "vitest";
import { BoardEditError, editBoardPost } from "../src/board-edit";

const version = "2026-10-29T00:00:00.000Z";
const post = { id: "post-1", authorEmail: "member@example.com", content: "Before", updatedAt: version,
	createdAt: version, imagePaths: ["images/board/synthetic.jpg"], comments: [{ id: "comment-1" }], reactions: [{ emoji: "👍" }] };
const input = { id: post.id, content: "  After  ", expectedUpdatedAt: version };

describe("post text edits", () => {
	it("changes text and version while retaining all other data and input objects", () => {
		const unrelated = { ...post, id: "post-2" };
		const result = editBoardPost([post, unrelated], "MEMBER@example.com", input, Date.parse(version));
		expect(result[0]).toEqual({ ...post, content: "After", updatedAt: "2026-10-29T00:00:00.001Z" });
		expect(result[0].comments).toBe(post.comments);
		expect(result[0].imagePaths).toBe(post.imagePaths);
		expect(result[1]).toBe(unrelated);
		expect(post.content).toBe("Before");
	});
	it.each(["other@example.com", "owner@example.com"])("rejects editing another author's post: %s", email => {
		expect(() => editBoardPost([post], email, input)).toThrow(BoardEditError);
	});
	it("rejects legacy posts lacking an author email even if the display name matches", () => {
		expect(() => editBoardPost([{ ...post, authorEmail: undefined }], "member@example.com", input)).toThrow(/舊貼文/);
	});
	it("rejects stale versions and deleted posts", () => {
		expect(() => editBoardPost([{ ...post, updatedAt: "later" }], "member@example.com", input)).toThrow(/已更新/);
		expect(() => editBoardPost([], "member@example.com", input)).toThrow(/不存在/);
	});
	it("permits empty text only when an existing image remains", () => {
		expect(editBoardPost([post], "member@example.com", { ...input, content: " " })[0].content).toBe("");
		expect(() => editBoardPost([{ ...post, imagePaths: [] }], "member@example.com", { ...input, content: " " })).toThrow(/文字或圖片/);
	});
	it("supports legacy single images and limits oversized text", () => {
		expect(editBoardPost([{ ...post, imagePaths: [], imagePath: "images/board/legacy.jpg" }], "member@example.com", { ...input, content: "" })[0].content).toBe("");
		expect(() => editBoardPost([post], "member@example.com", { ...input, content: "x".repeat(5001) })).toThrow(/5000/);
	});
});
