export function RecipePhoto({ photoUrl, name }: { photoUrl: string | null; name: string }) {
	if (!photoUrl) {
		return (
			<div className="recipe-photo-placeholder" aria-label={`${name}（尚無照片）`}>
				🍽️
			</div>
		);
	}

	return (
		<div className="recipe-photo-wrap">
			<img src={photoUrl} alt={name} loading="lazy" />
		</div>
	);
}
