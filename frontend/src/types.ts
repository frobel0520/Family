export interface BoardPost {
	id: string;
	author: string;
	content: string;
	createdAt: string;
	updatedAt: string;
}

export interface Recipe {
	id: string;
	name: string;
	category: string;
	photoUrl: string | null; // 菜色圖（自製插畫）；null = 顯示預設圖示
	recipeUrl?: string | null; // 食譜圖（手寫食譜的照片），有值時卡片顯示「食譜」按鈕
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
