export interface Session {
	token: string;
	name: string;
	avatar: string;
	expiresAt: number; // epoch ms
}
