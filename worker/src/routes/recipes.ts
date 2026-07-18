import { requireSession } from "../session";
import { updateJsonArrayFile, putBase64File } from "../github-contents";
import { jsonResponse } from "../response";
import { isRecipeCategory } from "../recipe-categories";

interface Recipe {
	id: string;
	name: string;
	category: string;
	photoUrl: string;
	uploadedBy: string;
	uploadedAt: string;
}

/** Frontend sends the photo as a data URL (e.g. "data:image/jpeg;base64,...") or plain base64. */
function stripDataUrlPrefix(photo: string): string {
	const match = photo.match(/^data:.*;base64,(.+)$/s);
	return match ? match[1] : photo;
}

export async function handleCreateRecipe(request: Request, env: Env): Promise<Response> {
	const auth = await requireSession(request, env);
	if ("response" in auth) return auth.response;

	let body: { name?: string; category?: string; photoBase64?: string };
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
	if (!body.photoBase64 || typeof body.photoBase64 !== "string") {
		return jsonResponse({ error: "Missing 'photoBase64'" }, 400);
	}

	const recipeId = crypto.randomUUID();
	const photoUrl = `images/recipes/${recipeId}.jpg`;

	await putBase64File(env, photoUrl, stripDataUrlPrefix(body.photoBase64), `recipes: photo for ${body.name}`);

	const now = new Date().toISOString();
	const newRecipe: Recipe = {
		id: recipeId,
		name: body.name.trim(),
		category: body.category,
		photoUrl,
		uploadedBy: auth.session.sub,
		uploadedAt: now,
	};

	await updateJsonArrayFile<Recipe>(
		env,
		"data/recipes.json",
		(recipes) => [...recipes, newRecipe],
		`recipes: add "${newRecipe.name}" by ${auth.session.sub}`,
	);

	return jsonResponse(newRecipe, 201);
}
