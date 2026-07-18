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
	photoUrl: string;
	uploadedBy: string;
	uploadedAt: string;
}

export interface Order {
	id: string;
	dishName: string;
	createdAt: string;
}
