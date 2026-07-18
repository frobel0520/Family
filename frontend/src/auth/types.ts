export interface Session {
	token: string;
	username: string;
	avatar: string;
	expiresAt: number; // epoch ms
}
