export interface Session {
	token: string;
	name: string; // 顯示名稱（暱稱優先，否則 Google 名字）
	avatar: string;
	email?: string; // 小寫；舊 session（更新前登入的）沒有，重新登入就有
	isOwner: boolean;
	expiresAt: number; // epoch ms
}

/** 登入/更新個人資料 API 回傳的 session 資料（兩個端點格式相同） */
export interface SessionResponse {
	token: string;
	user: { name: string; avatar: string; isOwner: boolean; email?: string };
	expiresIn: number;
}
