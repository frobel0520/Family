export interface Session {
	token: string;
	name: string;
	avatar: string;
	isOwner: boolean;
	expiresAt: number; // epoch ms
}
