import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { createRecipe, listRecipes } from "../api";
import type { Recipe } from "../types";
import { RECIPE_CATEGORIES } from "../recipeCategories";
import { fileToDataUrl } from "../fileToDataUrl";
import { RecipePhoto } from "../components/RecipePhoto";
import { PhotoCredits } from "../components/PhotoCredits";
import { Pager } from "../components/Pager";

const PAGE_SIZE = 10;

export function Recipes() {
	const { session } = useAuth();
	const [recipes, setRecipes] = useState<Recipe[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [activeCategory, setActiveCategory] = useState<string | null>(null);
	const [page, setPage] = useState(1);

	const [name, setName] = useState("");
	const [category, setCategory] = useState<string>(RECIPE_CATEGORIES[0]);
	const [photoFile, setPhotoFile] = useState<File | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	useEffect(() => {
		listRecipes()
			.then(setRecipes)
			.catch((err: Error) => setLoadError(err.message))
			.finally(() => setLoading(false));
	}, []);

	function selectCategory(c: string | null) {
		setActiveCategory(c);
		setPage(1);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!session || !name.trim() || !photoFile) return;

		setSubmitting(true);
		setSubmitError(null);
		try {
			const photoBase64 = await fileToDataUrl(photoFile);
			const newRecipe = await createRecipe(session.token, { name: name.trim(), category, photoBase64 });
			setRecipes((prev) => [...prev, newRecipe]);
			setName("");
			setPhotoFile(null);
		} catch (err) {
			setSubmitError((err as Error).message);
		} finally {
			setSubmitting(false);
		}
	}

	const visibleRecipes = activeCategory ? recipes.filter((r) => r.category === activeCategory) : recipes;
	const totalPages = Math.max(1, Math.ceil(visibleRecipes.length / PAGE_SIZE));
	const pageRecipes = visibleRecipes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	return (
		<div className="page">
			<h1>食譜庫</h1>

			<div className="category-filter">
				<button type="button" className={activeCategory === null ? "active" : ""} onClick={() => selectCategory(null)}>
					全部
				</button>
				{RECIPE_CATEGORIES.map((c) => (
					<button
						key={c}
						type="button"
						className={activeCategory === c ? "active" : ""}
						onClick={() => selectCategory(c)}
					>
						{c}
					</button>
				))}
			</div>

			{session ? (
				<form className="recipe-form" onSubmit={handleSubmit}>
					<input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="菜名" />
					<select value={category} onChange={(e) => setCategory(e.target.value)}>
						{RECIPE_CATEGORIES.map((c) => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</select>
					<input
						type="file"
						accept="image/*"
						onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
					/>
					<button type="submit" disabled={submitting || !name.trim() || !photoFile}>
						{submitting ? "上傳中…" : "上傳食譜"}
					</button>
					{submitError && <p className="error">{submitError}</p>}
				</form>
			) : (
				<p className="hint">登入後才能上傳食譜。</p>
			)}

			{loading && <p>載入中…</p>}
			{loadError && <p className="error">載入失敗：{loadError}</p>}

			<div className="recipe-grid">
				{pageRecipes.map((recipe) => (
					<div key={recipe.id} className="recipe-card">
						<RecipePhoto photoUrl={recipe.photoUrl} name={recipe.name} />
						<div className="recipe-name">{recipe.name}</div>
					</div>
				))}
			</div>
			{!loading && visibleRecipes.length === 0 && <p className="hint">這個分類還沒有食譜。</p>}

			<Pager page={page} totalPages={totalPages} onChange={setPage} />

			<PhotoCredits recipes={recipes} />
		</div>
	);
}
