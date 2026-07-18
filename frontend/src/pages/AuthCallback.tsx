import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function AuthCallback() {
	const { exchangeCode } = useAuth();
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		// GitHub appends "?code=...&state=..." to the real query string (before
		// the "#"), since it has no idea we're using a hash router. react-router's
		// useSearchParams() under HashRouter only sees params *inside* the hash,
		// so it never finds this — has to be read from window.location directly.
		const code = new URLSearchParams(window.location.search).get("code");
		if (!code) {
			setError("GitHub 沒有回傳授權碼，請重新登入。");
			return;
		}

		exchangeCode(code)
			.then(() => {
				// Drop the leftover ?code=...&state=... from the address bar.
				window.history.replaceState(null, "", `${window.location.pathname}#/`);
				navigate("/", { replace: true });
			})
			.catch((err: Error) => setError(err.message));
	}, [exchangeCode, navigate]);

	if (error) {
		return (
			<div className="auth-callback">
				<p>登入失敗：{error}</p>
				<a href="#/">回首頁</a>
			</div>
		);
	}

	return (
		<div className="auth-callback">
			<p>登入中…</p>
		</div>
	);
}
