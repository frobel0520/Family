// Mirrors project plan section 4 — inherited from the family's handwritten recipe book.
export const RECIPE_CATEGORIES = [
	"飯類",
	"快炒／主菜",
	"點心",
	"滷味",
	"麵食",
	"炸物／烤物",
	"飲料",
	"湯品",
] as const;

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export function isRecipeCategory(value: unknown): value is RecipeCategory {
	return typeof value === "string" && (RECIPE_CATEGORIES as readonly string[]).includes(value);
}
