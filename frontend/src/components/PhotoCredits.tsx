import type { Recipe } from "../types";

/**
 * CC 授權（BY 系列）要求標示作者與授權條款，所以出處不能整個拿掉；
 * 集中收在頁尾的收合區塊，不佔卡片版面。
 */
export function PhotoCredits({ recipes }: { recipes: Recipe[] }) {
	const credited = recipes.filter((r) => r.photoUrl && r.photoCredit);
	if (credited.length === 0) return null;

	return (
		<details className="photo-credits">
			<summary>📷 圖片出處（{credited.length} 張開放授權圖）</summary>
			<ul>
				{credited.map((r) => (
					<li key={r.id}>
						{r.name} —{" "}
						<a href={r.photoCredit!.source} target="_blank" rel="noreferrer">
							{r.photoCredit!.author}
						</a>{" "}
						（{r.photoCredit!.license}）
					</li>
				))}
			</ul>
		</details>
	);
}
