import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, SessionResponse } from "./types";
import { buildAuthorizeUrl, getRedirectUri } from "./googleOAuth";

const STORAGE_KEY = "family-app-session";
// 「記住我」：每天最多自動續期一次（後端 TTL 是 30 天，所以每天開 App 的人永遠不會被登出）
const REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;

function loadSession(): Session | null {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return null;

	try {
		const session: Session = JSON.parse(raw);
		if (session.expiresAt < Date.now()) {
			localStorage.removeItem(STORAGE_KEY);
			return null;
		}
		return session;
	} catch {
		return null;
	}
}

interface AuthContextValue {
	session: Session | null;
	login: () => void;
	logout: () => void;
	exchangeCode: (code: string) => Promise<void>;
	/** 更新個人資料後，後端會重簽 session（新暱稱/大頭貼立刻生效），用這個套用。 */
	applySessionResponse: (data: SessionResponse) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [session, setSession] = useState<Session | null>(() => loadSession());
	const refreshing = useRef(false); // 續期進行中，避免 visibilitychange 連續觸發時打好幾次

	const syncedOnLaunch = useRef(false);

	const login = useCallback(() => {
		window.location.href = buildAuthorizeUrl();
	}, []);

	const logout = useCallback(() => {
		localStorage.removeItem(STORAGE_KEY);
		setSession(null);
	}, []);

	const applySessionResponse = useCallback((data: SessionResponse) => {
		const now = Date.now();
		const expiresAt = now + data.expiresIn * 1000;
		const newSession: Session = {
			token: data.token,
			name: data.user.name,
			avatar: data.user.avatar,
			email: data.user.email,
			isOwner: data.user.isOwner,
			expiresAt,
			// 每天續一次，但不超過有效期的一半（TTL 被改短時也不會變成「永遠不續期」）
			refreshAt: now + Math.min(REFRESH_EVERY_MS, (data.expiresIn * 1000) / 2),
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
		setSession(newSession);
	}, []);

	const exchangeCode = useCallback(
		async (code: string) => {
			const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/callback`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, redirectUri: getRedirectUri() }),
			});

			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(body.error ?? `Login failed with status ${response.status}`);
			}

			applySessionResponse((await response.json()) as SessionResponse);
		},
		[applySessionResponse],
	);

	/**
	 * 「記住我」的續期：拿還沒過期的 token 換一張新的（有效期重新計算）。
	 * 401/403（token 過期、或存取權被管理員移除）→ 登出，回登入頁；
	 * 其他失敗（離線、後端還沒部署到有這個端點的版本）→ 什麼都不做，保留現有 session 下次再試。
	 */
	const maybeRefresh = useCallback(
		async (current: Session, force = false) => {
			if (refreshing.current) return;
			if (!force && current.refreshAt && Date.now() < current.refreshAt) return;

			refreshing.current = true;
			try {
				const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/refresh`, {
					method: "POST",
					headers: { Authorization: `Bearer ${current.token}` },
				});
				if (response.status === 401 || response.status === 403) {
					logout();
					return;
				}
				if (!response.ok) return;
				applySessionResponse((await response.json()) as SessionResponse);
			} catch {
				// 離線或後端暫時打不到：維持現有 session，下次開 App 再續期
			} finally {
				refreshing.current = false;
			}
		},
		[applySessionResponse, logout],
	);

	// 開 App 時續期一次；PWA 從背景切回前景也算「開 App」（手機上使用者幾乎不會真的重開）
	useEffect(() => {
		const current = session;
		if (!current) return;
		const forceProfileSync = !syncedOnLaunch.current;
		syncedOnLaunch.current = true;
		void maybeRefresh(current, forceProfileSync);

		// 用 const 箭頭函式而不是 function 宣告：hoisting 會讓 TS 看不到上面的 null 檢查
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") void maybeRefresh(current);
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => document.removeEventListener("visibilitychange", onVisibilityChange);
	}, [session, maybeRefresh]);

	// Session may have expired since last load without a re-render happening.
	useEffect(() => {
		if (session && session.expiresAt < Date.now()) logout();
	}, [session, logout]);

	return (
		<AuthContext.Provider value={{ session, login, logout, exchangeCode, applySessionResponse }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
	return ctx;
}
