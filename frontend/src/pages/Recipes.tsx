import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { createRecipe, listRecipes, uploadRecipeImage } from "../api";
import type { Recipe } from "../types";
import { RECIPE_CATEGORIES } from "../recipeCategories";
import { fileToDataUrl } from "../fileToDataUrl";
import { RecipeCard, RecipeModal } from "../components/RecipeCard";
import { Pager } from "../components/Pager";

const PAGE_SIZE = 10;

export function Recipes() {
	const { session } = useAuth();
	const [recipes, setRecipes] = useState<Recipe[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [activeCategory, setActiveCategory] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [viewing, setViewing] = useState<Recipe | null>(null);

	const [formOpen, setFormOpen] = useState(false);
	const [name, setName] = useState("");
	const [category, setCategory] = useState<string>(RECIPE_CATEGORIES[0]);
	const [recipeFile, setRecipeFile] = useState<File | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	useEffect(() => {
		if (!session) {
			setLoading(false);
			return;
		}
		setLoading(true);
		listRecipes(session.token)
			.then(setRecipes)
			.catch((err: Error) => setLoadError(err.message))
			.finally(() => setLoading(false));
	}, [session?.token]);

	function selectCategory(c: string | null) {
		setActiveCategory(c);
		setPage(1);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!session || !name.trim()) return;

		setSubmitting(true);
		setSubmitError(null);
		try {
			const recipeImageBase64 = recipeFile ? await fileToDataUrl(recipeFile) : undefined;
			const newRecipe = await createRecipe(session.token, { name: name.trim(), category, recipeImageBase64 });
			setRecipes((prev) => [...prev, newRecipe]);
			setName("");
			setRecipeFile(null);
			setFormOpen(false);
		} catch (err) {
			setSubmitError((err as Error).message);
		} finally {
			setSubmitting(false);
		}
	}

	async function handleUploadRecipe(recipe: Recipe, dataUrl: string) {
		if (!session) return;
		const updated = await uploadRecipeImage(session.token, recipe.id, dataUrl);
		setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
		setViewing((prev) => (prev && prev.id === updated.id ? updated : prev));
	}

	const visibleRecipes = activeCategory ? recipes.filter((r) => r.category === activeCategory) : recipes;
	const totalPages = Math.max(1, Math.ceil(visibleRecipes.length / PAGE_SIZE));
	const pageRecipes = visibleRecipes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	return (
		<div className="page">
			<div className="page-title-row">
				<h1>食譜</h1>
				{session && (
					<button
						type="button"
						className="add-toggle-btn"
						aria-label={formOpen ? "收合新增菜色" : "新增菜色"}
						title={formOpen ? "收合" : "新增菜色"}
						onClick={() => setFormOpen((v) => !v)}
					>
						{formOpen ? "✕" : "＋"}
					</button>
				)}
			</div>

			{!session ? (
				<p className="hint">請先登入才能查看食譜庫（只有家人看得到）。</p>
			) : (
				<>
					<div className="category-filter">
						<button
							type="button"
							className={activeCategory === null ? "active" : ""}
							onClick={() => selectCategory(null)}
						>
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

					{formOpen && (
						<form className="recipe-form" onSubmit={handleSubmit}>
							<input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="新菜色名稱" />
							<select value={category} onChange={(e) => setCategory(e.target.value)}>
								{RECIPE_CATEGORIES.map((c) => (
									<option key={c} value={c}>
										{c}
									</option>
								))}
							</select>
							<label className="recipe-file-label">
								食譜照片（可選）
								<input
									type="file"
									accept="image/*"
									onChange={(e) => setRecipeFile(e.target.files?.[0] ?? null)}
								/>
							</label>
							<button type="submit" disabled={submitting || !name.trim()}>
								{submitting ? "新增中…" : "新增菜色"}
							</button>
							{submitError && <p className="error">{submitError}</p>}
						</form>
					)}

					{loading && <p>載入中…</p>}
					{loadError && <p className="error">載入失敗：{loadError}</p>}

					<div className="recipe-grid">
						{pageRecipes.map((recipe) => (
							<RecipeCard key={recipe.id} recipe={recipe} onViewRecipe={setViewing} onUploadRecipe={handleUploadRecipe} />
						))}
					</div>
					{!loading && visibleRecipes.length === 0 && <p className="hint">這個分類還沒有食譜。</p>}

					<Pager page={page} totalPages={totalPages} onChange={setPage} />

					{viewing && <RecipeModal recipe={viewing} onClose={() => setViewing(null)} onReplace={handleUploadRecipe} />}
				</>
			)}
		</div>
	);
}
