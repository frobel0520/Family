// 佈景主題：預設淺色，使用者可在設定頁改成深色或跟隨系統。選擇只存在這台裝置（localStorage）。

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

export const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
	{ value: "light", label: "淺色" },
	{ value: "dark", label: "深色" },
	{ value: "system", label: "跟隨系統" },
];

const STORAGE_KEY = "family-theme";
const DEFAULT_PREFERENCE: ThemePreference = "light";
// 與 index.css 的 --bg 一致，讓手機狀態列跟畫面同色。
const THEME_COLOR: Record<ResolvedTheme, string> = { light: "#f8f6f0", dark: "#201e1a" };

const darkQuery = (): MediaQueryList | null =>
	typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function isThemePreference(value: unknown): value is ThemePreference {
	return value === "light" || value === "dark" || value === "system";
}

export function readThemePreference(): ThemePreference {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return isThemePreference(stored) ? stored : DEFAULT_PREFERENCE;
	} catch {
		// 無痕模式或封鎖儲存時，退回預設淺色。
		return DEFAULT_PREFERENCE;
	}
}

function resolve(preference: ThemePreference): ResolvedTheme {
	if (preference !== "system") return preference;
	return darkQuery()?.matches ? "dark" : "light";
}

function apply(preference: ThemePreference): void {
	const resolved = resolve(preference);
	document.documentElement.dataset.theme = resolved;
	document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[resolved]);
}

export function setThemePreference(preference: ThemePreference): void {
	try {
		localStorage.setItem(STORAGE_KEY, preference);
	} catch {
		// 存不進去也照樣套用到這次開啟的畫面。
	}
	apply(preference);
}

/** 啟動時套用已存的選擇；選「跟隨系統」時，系統切換深淺色會即時跟著變。 */
export function initTheme(): void {
	apply(readThemePreference());
	darkQuery()?.addEventListener("change", () => {
		if (readThemePreference() === "system") apply("system");
	});
}
