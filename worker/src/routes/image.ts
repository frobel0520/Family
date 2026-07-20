import { fetchRawFile } from "../github-contents";
import { verifyPathSignature } from "../image-url";

// 只轉發這幾個資料夾（貼文/留言附圖、食譜圖、大頭貼），避免簽章驗證通過後被拿去讀 repo 其他檔案。
const ALLOWED_PREFIXES = ["images/recipes/", "images/board/", "images/avatars/"];

function contentTypeFor(path: string): string {
	return path.endsWith(".png") ? "image/png" : "image/jpeg";
}

/** repo 是 private 之後，所有圖片都要經過這裡轉發（見 image-url.ts 說明簽章設計）。 */
export async function handleImage(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const path = url.searchParams.get("path");
	const sig = url.searchParams.get("sig");
	const version = url.searchParams.get("v");

	if (!path || !sig || path.includes("..") || !ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
		return new Response("Bad request", { status: 400 });
	}
	if (!(await verifyPathSignature(path, version, sig, env.JWT_SECRET))) {
		return new Response("Forbidden", { status: 403 });
	}

	const upstream = await fetchRawFile(env, path);
	if (!upstream) return new Response("Not found", { status: 404 });

	return new Response(upstream.body, {
		headers: {
			"Content-Type": contentTypeFor(path),
			// 簽章連結本身就是存取憑證（不需要每次重驗），放心讓瀏覽器/CDN 快取。
			"Cache-Control": "public, max-age=86400, immutable",
		},
	});
}
