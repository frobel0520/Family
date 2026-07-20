export interface BoardComment {
	id: string;
	author: string;
	authorEmail?: string; // 刪除權限比對用；舊資料沒有
	avatar?: string;
	content: string;
	createdAt: string;
}

export interface BoardPost {
	id: string;
	author: string;
	authorEmail?: string; // 刪除權限比對用；舊資料沒有
	avatar?: string; // 舊貼文沒有頭像，前端用名字首字替代
	content: string; // 有附圖時可能是空字串
	imageUrl?: string | null; // 附圖（Worker 已轉成 raw URL）
	createdAt: string;
	updatedAt: string;
	comments?: BoardComment[];
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
	createdAt: string;
}

export interface PendingRequest {
	email: string;
	name: string;
	avatar: string;
	requestedAt: string;
}
