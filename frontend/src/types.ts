export interface BoardComment {
	id: string;
	author: string;
	authorEmail?: string; // 刪除權限比對用；舊資料沒有
	avatar?: string;
	content: string; // 有附圖時可能是空字串
	imageUrls?: string[]; // 附圖（Worker 已把舊的單張欄位也攤進這個陣列並轉成簽章網址）
	createdAt: string;
}

/** 表情回應彙總（Worker 算好的，不含 email）；同一個人一則貼文只會有一個表情。 */
export interface ReactionSummary {
	emoji: string;
	count: number;
	names: string[]; // 按了這個表情的人（暱稱優先）
	mine: boolean; // 我按的就是這個
}

export interface BoardPost {
	id: string;
	author: string;
	authorEmail?: string; // 刪除權限比對用；舊資料沒有
	avatar?: string; // 舊貼文沒有頭像，前端用名字首字替代
	content: string; // 有附圖時可能是空字串
	imageUrls?: string[]; // 附圖（Worker 已把舊的單張欄位也攤進這個陣列並轉成簽章網址）
	createdAt: string;
	updatedAt: string;
	comments?: BoardComment[];
	reactions?: ReactionSummary[]; // 舊前端載到的舊回應可能沒有這欄，一律當空陣列
}

export interface Profile {
	nickname: string | null;
	customAvatarUrl: string | null;
	googleName: string;
	googleAvatar: string;
}

export interface Recipe {
	id: string;
	name: string;
	category: string;
	photoUrl: string | null; // 菜色圖（自製插畫）；null = 顯示預設圖示
	recipeUrl?: string | null; // 食譜圖（手寫食譜的照片），有值時卡片顯示「食譜」按鈕
	recipeUpdatedAt?: string; // 食譜圖最後更新時間（當快取破壞參數用）
	uploadedBy: string;
	uploadedAt: string;
}

export interface Order {
	id: string;
	dishName: string;
	orderedBy?: string; // 點的人（暱稱優先）；舊資料沒有，只顯示時間
	orderedByEmail?: string;
	avatar?: string;
	createdAt: string;
}

/** 行事曆活動。日期/時間都是台灣時間的字串（後端也這樣存，見 worker/src/events.ts）。 */
export interface FamilyEvent {
	id: string;
	title: string;
	date: string; // YYYY-MM-DD
	time?: string | null; // HH:mm；null = 整天
	note?: string;
	createdBy: string;
	createdByEmail: string;
	avatar?: string | null;
	createdAt: string;
	updatedAt: string;
	remindEmails: string[]; // 要收到提醒的人（email）
	remindAt?: string | null; // YYYY-MM-DDTHH:mm
	notifiedAt?: string | null;
}

/** 已核准的家人（勾選提醒對象用）。 */
export interface FamilyMember {
	email: string;
	name: string;
	avatar: string | null;
}

export interface PendingRequest {
	email: string;
	name: string;
	avatar: string;
	requestedAt: string;
}
