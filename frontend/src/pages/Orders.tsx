import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { createOrder, listOrders, listRecipes } from "../api";
import type { Order, Recipe } from "../types";
import { RECIPE_CATEGORIES } from "../recipeCategories";
import { RecipePhoto } from "../components/RecipePhoto";
import { Pager } from "../components/Pager";

const PAGE_SIZE = 10;

export function Orders() {
	const { session } = useAuth();
	const [recipes, setRecipes] = useState<Recipe[]>([]);
	const [orders, setOrders] = useState<Order[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [category, setCategory] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [addingId, setAddingId] = useState<string | null>(null);
	const [addError, setAddError] = useState<string | null>(null);

	useEffect(() => {
		Promise.all([listRecipes(), listOrders()])
			.then(([recipesData, ordersData]) => {
				setRecipes(recipesData);
				setOrders(ordersData);
			})
			.catch((err: Error) => setLoadError(err.message))
			.finally(() => setLoading(false));
	}, []);

	async function handleAdd(recipe: Recipe) {
		if (!session) return;
		setAddingId(recipe.id);
		setAddError(null);
		try {
			const newOrder = await createOrder(session.token, recipe.name);
			setOrders((prev) => [newOrder, ...prev]);
		} catch (err) {
			setAddError((err as Error).message);
		} finally {
			setAddingId(null);
		}
	}

	function selectCategory(c: string) {
		setCategory(c);
		setPage(1);
	}

	const results = category ? recipes.filter((r) => r.category === category) : [];
	const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
	const pageResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	return (
		<div className="page orders-page">
			<h1>點菜</h1>

			<div className="category-filter">
				{RECIPE_CATEGORIES.map((c) => (
					<button
						key={c}
						type="button"
						className={category === c ? "active" : ""}
						onClick={() => selectCategory(c)}
					>
						{c}
					</button>
				))}
			</div>

			{loading && <p>載入中…</p>}
			{loadError && <p className="error">載入失敗：{loadError}</p>}
			{addError && <p className="error">加入失敗：{addError}</p>}

			<div className="orders-layout">
				<div className="orders-results-col">
					<div className="orders-results">
						{category && results.length === 0 && <p className="hint">這個分類還沒有食譜。</p>}
						{category &&
							pageResults.map((recipe) => (
								<div key={recipe.id} className="recipe-card">
									<RecipePhoto photoUrl={recipe.photoUrl} name={recipe.name} photoCredit={recipe.photoCredit} />
									<div className="recipe-name">{recipe.name}</div>
									<button
										type="button"
										disabled={!session || addingId === recipe.id}
										onClick={() => handleAdd(recipe)}
									>
										{addingId === recipe.id ? "加入中…" : "加入訂單"}
									</button>
								</div>
							))}
						{!session && category && <p className="hint">登入後才能點菜。</p>}
						{!category && <p className="hint">選一個分類看看有什麼菜。</p>}
					</div>
					<Pager page={page} totalPages={totalPages} onChange={setPage} />
				</div>

				<div className="orders-list">
					<h2>訂單列表</h2>
					<ul>
						{orders.map((order) => (
							<li key={order.id}>{order.dishName}</li>
						))}
					</ul>
					{orders.length === 0 && <p className="hint">目前沒有點菜紀錄。</p>}
				</div>
			</div>
		</div>
	);
}
