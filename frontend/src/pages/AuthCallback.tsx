import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

/**
 * Rendered instead of the normal router tree whenever the page loads with a
 * "?code=..." query param — i.e. right after Google's OAuth redirect. Google
 * requires the redirect_uri to be the exact registered page (no #fragment),
 * so this can't be a HashRouter route; App.tsx detects the query param and
 * swaps this in before the router even mounts.
 */
export function AuthCallback({ onDone }: { onDone: () => void }) {
	const { exchangeCode } = useAuth();
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const code = new URLSearchParams(window.location.search).get("code");
		if (!code) {
			setError("Google 沒有回傳授權碼，請重新登入。");
			return;
		}

		exchangeCode(code)
			.then(() => {
				window.history.replaceState(null, "", `${window.location.pathname}#/`);
				onDone();
			})
			.catch((err: Error) => setError(err.message));
	}, [exchangeCode, onDone]);

	if (error) {
		return (
			<div className="auth-callback">
				<p>登入失敗：{error}</p>
				<button
					type="button"
					onClick={() => {
						window.history.replaceState(null, "", `${window.location.pathname}#/`);
						onDone();
					}}
				>
					回首頁
				</button>
			</div>
		);
	}

	return (
		<div className="auth-callback">
			<p>登入中…</p>
		</div>
	);
}
