import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { signSession } from "../src/jwt";

const secret = "synthetic-board-edit-secret";
const env = { JWT_SECRET: secret, OWNER_EMAIL: "owner@example.com", GITHUB_REPO: "example/synthetic-data", GITHUB_BOT_PAT: "synthetic-token" } as Env;
const ctx = { waitUntil: vi.fn(), passThroughOnException() {} } as unknown as ExecutionContext;
const version = "2026-10-29T00:00:00.000Z";
const post = { id: "post-1", author: "Synthetic", authorEmail: "member@example.com", content: "Before", createdAt: version,
	updatedAt: version, imagePaths: ["images/board/synthetic.jpg"], comments: [{ id: "comment-1" }], reactions: [] };
const input = { id: post.id, content: "After", expectedUpdatedAt: version };

afterEach(() => vi.restoreAllMocks());

function upstream(posts = [post], writeStatus = 200) {
	let written: { message: string; content: string; sha: string } | undefined;
	const mock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
		const path = String(url);
		if (init?.method === "PUT") { written = JSON.parse(String(init.body)); return new Response("{}", { status: writeStatus }); }
		const data = path.endsWith("data/board.json") ? posts : { approved: ["member@example.com", "other@example.com"], pending: [] };
		return new Response(JSON.stringify({ content: btoa(JSON.stringify(data)), sha: "current-file-version" }));
	});
	return { mock, written: () => written };
}

async function invoke(body: unknown = input, email = "member@example.com", authorized = true) {
	const token = await signSession({ sub: "synthetic", name: "Synthetic", email, avatar: "", isOwner: false }, secret, 300);
	return worker.fetch(new Request("https://example.com/api/board/edit", {
		method: "POST", headers: { "content-type": "application/json", origin: "https://example.com", ...(authorized ? { cookie: `__Host-family_session=${token}` } : {}) },
		body: JSON.stringify(body),
	}), env, ctx);
}

describe("authenticated board edit route", () => {
	it("advertises editing only after authenticating against the current Worker", async () => {
		upstream();
		const token = await signSession({ sub: "synthetic", name: "Synthetic", email: "member@example.com", avatar: "", isOwner: false }, secret, 300);
		const response = await worker.fetch(new Request("https://example.com/api/board/edit", { headers: { cookie: `__Host-family_session=${token}` } }), env, ctx);
		expect(response.status).toBe(200); expect(await response.json()).toEqual({ textEdit: true });
		expect((await worker.fetch(new Request("https://example.com/api/board/edit"), env, ctx)).status).toBe(401);
	});
	it("saves text with the current file SHA, preserves attachments/comments and never sends notifications", async () => {
		const remote = upstream();
		const response = await invoke({ ...input, imagePaths: ["forged"], authorEmail: "forged@example.com" });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ id: post.id, content: "After" });
		const write = remote.written()!;
		expect(write.sha).toBe("current-file-version");
		expect(write.message).toBe("board: edit post text");
		expect(JSON.parse(atob(write.content))[0]).toMatchObject({ ...post, content: "After", updatedAt: expect.any(String) });
		expect(ctx.waitUntil).not.toHaveBeenCalled();
	});
	it.each(["other@example.com", "owner@example.com"])("blocks another member/owner without writing: %s", async email => {
		const remote = upstream(); expect((await invoke(input, email)).status).toBe(403); expect(remote.written()).toBeUndefined();
	});
	it("requires authentication before upstream reads", async () => {
		const remote = upstream(); expect((await invoke(input, "member@example.com", false)).status).toBe(401); expect(remote.mock).not.toHaveBeenCalled();
	});
	it.each([null, [], {}, { ...input, content: 1 }, { ...input, expectedUpdatedAt: "" }])("rejects invalid body without writing: %j", async body => {
		const remote = upstream(); expect((await invoke(body)).status).toBe(400); expect(remote.written()).toBeUndefined();
	});
	it("returns conflict for a stale edit without committing", async () => {
		const remote = upstream([{ ...post, updatedAt: "later" }]); expect((await invoke()).status).toBe(409); expect(remote.written()).toBeUndefined();
	});
	it("surfaces a GitHub SHA conflict safely without overwriting newer content", async () => {
		upstream([post], 409); const response = await invoke(); expect(response.status).toBe(409); expect(await response.text()).not.toContain("synthetic-token");
	});
});
