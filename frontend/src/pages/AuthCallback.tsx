import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";

/**
 * Rendered instead of the normal router tree whenever the page loads with a
 * "?code=..." query param — i.e. right after Google's OAuth redirect. Google
 * requires the redirect_uri to be the exact registered page (no #fragment),
 * so this can't be a HashRouter route; App.tsx detects the query param and
 * swaps this in before the router even mounts.
 */
function readInitialOAuthParams(): {
	code: string | null;
	state: string | null;
	initialError: string | null;
} {
	const params = new URLSearchParams(window.location.search);
	if (params.get("error")) {
		return { code: null, state: null, initialError: "已取消 Google 登入，請重新登入。" };
	}
	const code = params.get("code");
	const state = params.get("state");
	if (!code || !state) {
		return { code: null, state: null, initialError: "Google 登入驗證參數不完整，請重新登入。" };
	}
	return { code, state, initialError: null };
}

export function AuthCallback({ onDone }: { onDone: () => void }) {
	const { exchangeCode } = useAuth();
	const [initial] = useState(readInitialOAuthParams);
	const [error, setError] = useState<string | null>(initial.initialError);
	const started = useRef(false);

	useEffect(() => {
		// Strip sensitive OAuth code & state from the browser URL immediately.
		window.history.replaceState(null, "", `${window.location.pathname}#/`);

		if (!initial.code || !initial.state || started.current) {
			return;
		}
		started.current = true;

		exchangeCode(initial.code, initial.state)
			.then(() => {
				onDone();
			})
			.catch((err: Error) => setError(err.message));
	}, [exchangeCode, initial, onDone]);

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
