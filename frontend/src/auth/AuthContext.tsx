import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, SessionResponse } from "./types";
import { buildAuthorizeUrl, getRedirectUri } from "./googleOAuth";

const STORAGE_KEY = "family-app-session";

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

	const login = useCallback(() => {
		window.location.href = buildAuthorizeUrl();
	}, []);

	const logout = useCallback(() => {
		localStorage.removeItem(STORAGE_KEY);
		setSession(null);
	}, []);

	const applySessionResponse = useCallback((data: SessionResponse) => {
		const newSession: Session = {
			token: data.token,
			name: data.user.name,
			avatar: data.user.avatar,
			email: data.user.email,
			isOwner: data.user.isOwner,
			expiresAt: Date.now() + data.expiresIn * 1000,
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
