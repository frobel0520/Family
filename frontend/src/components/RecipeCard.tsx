import { useRef, useState } from "react";
import type { Recipe } from "../types";
import { RecipePhoto } from "./RecipePhoto";
import { fileToDataUrl } from "../fileToDataUrl";

/**
 * 食譜卡片：插畫 + 菜名，角落是「食譜」按鈕（有食譜圖時開圖，
 * 沒有且允許上傳時變成「＋食譜」直接選檔上傳）。
 */
export function RecipeCard({
	recipe,
	onViewRecipe,
	onUploadRecipe,
	children,
}: {
	recipe: Recipe;
	onViewRecipe: (recipe: Recipe) => void;
	onUploadRecipe?: (recipe: Recipe, dataUrl: string) => Promise<void>;
	children?: React.ReactNode;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file || !onUploadRecipe) return;
		setUploading(true);
		setError(null);
		try {
			const dataUrl = await fileToDataUrl(file);
			await onUploadRecipe(recipe, dataUrl);
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setUploading(false);
		}
	}

	return (
		<div className="recipe-card">
			<div className="recipe-photo-box">
				<RecipePhoto photoUrl={recipe.photoUrl} name={recipe.name} />
				{recipe.recipeUrl ? (
					<button type="button" className="recipe-corner-btn" onClick={() => onViewRecipe(recipe)}>
						📖 食譜
					</button>
				) : onUploadRecipe ? (
					<>
						<button
							type="button"
							className="recipe-corner-btn recipe-corner-btn-add"
							disabled={uploading}
							onClick={() => fileRef.current?.click()}
						>
							{uploading ? "上傳中…" : "＋食譜"}
						</button>
						<input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
					</>
				) : null}
			</div>
			<div className="recipe-name">{recipe.name}</div>
			{error && <p className="error">{error}</p>}
			{children}
		</div>
	);
}

/** 點「食譜」後的彈窗：顯示該道菜的食譜圖片。 */
export function RecipeModal({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
	if (!recipe.recipeUrl) return null;
	return (
		<div className="recipe-modal-backdrop" onClick={onClose}>
			<div className="recipe-modal" onClick={(e) => e.stopPropagation()}>
				<div className="recipe-modal-header">
					<span>{recipe.name}｜食譜</span>
					<button type="button" onClick={onClose} aria-label="關閉">
						✕
					</button>
				</div>
				<img src={recipe.recipeUrl} alt={`${recipe.name} 的食譜`} />
			</div>
		</div>
	);
}
