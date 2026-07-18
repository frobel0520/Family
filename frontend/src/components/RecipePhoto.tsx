import type { Recipe } from "../types";

export function RecipePhoto({
	photoUrl,
	name,
	photoCredit,
}: {
	photoUrl: string | null;
	name: string;
	photoCredit?: Recipe["photoCredit"];
}) {
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
			{photoCredit && (
				<a
					className="photo-credit"
					href={photoCredit.source}
					target="_blank"
					rel="noreferrer"
					onClick={(e) => e.stopPropagation()}
				>
					📷 {photoCredit.author} · {photoCredit.license}
				</a>
			)}
		</div>
	);
}
