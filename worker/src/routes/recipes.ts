import { requireSession } from "../session";
import { readJsonArrayFile, updateJsonArrayFile, putBase64File } from "../github-contents";
import { jsonResponse } from "../response";
import { isRecipeCategory } from "../recipe-categories";

interface Recipe {
	id: string;
	name: string;
	category: string;
	photoUrl: string | null; // 菜色圖（目前全部是自製插畫）；null = 顯示預設圖示
	recipeUrl?: string | null; // 食譜圖（家人拍的手寫食譜），卡片上的「食譜」按鈕開這張
	recipeUpdatedAt?: string; // 食譜圖最後更新時間；前端拿來當快取破壞參數，換圖後才不會顯示舊圖
	uploadedBy: string;
	uploadedAt: string;
}

/** Frontend sends the photo as a data URL (e.g. "data:image/jpeg;base64,...") or plain base64. */
function stripDataUrlPrefix(photo: string): string {
	const match = photo.match(/^data:.*;base64,(.+)$/s);
	return match ? match[1] : photo;
}

/** Stored as repo-relative paths; resolve to fetchable raw.githubusercontent.com URLs. */
function toRawUrl(env: Env, repoRelativePath: string): string {
	return `https://raw.githubusercontent.com/${env.GITHUB_REPO}/main/${repoRelativePath}`;
}

function withRawUrls(env: Env, recipe: Recipe): Recipe {
	return {
		...recipe,
		photoUrl: recipe.photoUrl ? toRawUrl(env, recipe.photoUrl) : null,
		recipeUrl: recipe.recipeUrl ? toRawUrl(env, recipe.recipeUrl) : null,
	};
}

export async function handleListRecipes(_request: Request, env: Env): Promise<Response> {
	const recipes = await readJsonArrayFile<Recipe>(env, "data/recipes.json");
	return jsonResponse(recipes.map((recipe) => withRawUrls(env, recipe)));
}

export async function handleCreateRecipe(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	let body: { name?: string; category?: string; recipeImageBase64?: string };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}

	if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
		return jsonResponse({ error: "Missing 'name'" }, 400);
	}
	if (!isRecipeCategory(body.category)) {
		return jsonResponse({ error: "Invalid or missing 'category'" }, 400);
	}

	const recipeId = crypto.randomUUID();

	let recipeUrl: string | null = null;
	if (body.recipeImageBase64 && typeof body.recipeImageBase64 === "string") {
		recipeUrl = `images/recipes/${recipeId}-recipe.jpg`;
		await putBase64File(env, recipeUrl, stripDataUrlPrefix(body.recipeImageBase64), `recipes: recipe image for ${body.name}`);
	}

	const now = new Date().toISOString();
	const newRecipe: Recipe = {
		id: recipeId,
		name: body.name.trim(),
		category: body.category,
		photoUrl: null,
		recipeUrl,
		uploadedBy: auth.session.name,
		uploadedAt: now,
	};

	await updateJsonArrayFile<Recipe>(
		env,
		"data/recipes.json",
		(recipes) => [...recipes, newRecipe],
		`recipes: add "${newRecipe.name}" by ${auth.session.name}`,
	);

	return jsonResponse(withRawUrls(env, newRecipe), 201);
}

export async function handleUploadRecipeImage(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	let body: { id?: string; photoBase64?: string };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}

	if (!body.id || typeof body.id !== "string") {
		return jsonResponse({ error: "Missing 'id'" }, 400);
	}
	if (!body.photoBase64 || typeof body.photoBase64 !== "string") {
		return jsonResponse({ error: "Missing 'photoBase64'" }, 400);
	}

	const recipes = await readJsonArrayFile<Recipe>(env, "data/recipes.json");
	const target = recipes.find((r) => r.id === body.id);
	if (!target) {
		return jsonResponse({ error: "Recipe not found" }, 404);
	}

	const recipeUrl = `images/recipes/${target.id}-recipe.jpg`;
	await putBase64File(env, recipeUrl, stripDataUrlPrefix(body.photoBase64), `recipes: recipe image for ${target.name}`);

	let updated: Recipe = target;
	await updateJsonArrayFile<Recipe>(
		env,
		"data/recipes.json",
		(list) =>
			list.map((r) => {
				if (r.id !== body.id) return r;
				updated = { ...r, recipeUrl, recipeUpdatedAt: new Date().toISOString() };
				return updated;
			}),
		`recipes: attach recipe image to "${target.name}" by ${auth.session.name}`,
	);

	return jsonResponse(withRawUrls(env, updated));
}
