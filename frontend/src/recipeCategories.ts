// Mirrors worker/src/recipe-categories.ts — keep both in sync if this list changes.
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
