import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("router", () => {
	it("returns 404 JSON for unknown paths", async () => {
		const request = new IncomingRequest("http://example.com/api/nope");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Not found" });
	});

	it("requires auth on push subscribe", async () => {
		const request = new IncomingRequest("http://example.com/api/push/subscribe", {
			method: "POST",
			body: JSON.stringify({}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});

	it("requires auth on the board/recipes/orders lists (repo is private now)", async () => {
		for (const path of ["/api/board", "/api/recipes", "/api/orders"]) {
			const request = new IncomingRequest(`http://example.com${path}`);
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect([path, response.status]).toEqual([path, 401]);
		}
	});

	it("image proxy rejects malformed/disallowed paths with 400 before ever checking the signature", async () => {
		// 簽章正確性驗證交給 image-url.spec.ts（那邊直接測 signPath/verifyPathSignature，
		// 不用透過 wrangler test env 生一把真的 JWT_SECRET）；這裡只測路徑檢查那一關。
		const cases = [
			"/api/image?path=images/board/x.jpg", // 沒帶 sig
			"/api/image?path=../secrets.json&sig=whatever", // 路徑逃逸
			"/api/image?path=data/board.json&sig=whatever", // 不在允許的資料夾前綴
		];
		for (const path of cases) {
			const request = new IncomingRequest(`http://example.com${path}`);
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status, path).toBe(400);
		}
	});
});
