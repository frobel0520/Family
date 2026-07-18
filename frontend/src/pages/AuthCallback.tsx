import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function AuthCallback() {
	const [searchParams] = useSearchParams();
	const { exchangeCode } = useAuth();
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const code = searchParams.get("code");
		if (!code) {
			setError("GitHub 沒有回傳授權碼，請重新登入。");
			return;
		}

		exchangeCode(code)
			.then(() => navigate("/", { replace: true }))
			.catch((err: Error) => setError(err.message));
	}, [searchParams, exchangeCode, navigate]);

	if (error) {
		return (
			<div className="auth-callback">
				<p>登入失敗：{error}</p>
				<a href="/">回首頁</a>
			</div>
		);
	}

	return (
		<div className="auth-callback">
			<p>登入中…</p>
		</div>
	);
}
