import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getProfile, updateProfile } from "../api";
import type { Profile } from "../types";
import { disablePush, enablePush, getCurrentSubscription, pushSupported } from "../push";
import { fileToSquareJpegDataUrl } from "../fileToDataUrl";
import { Avatar } from "../components/Avatar";

/** 是否已經以「已安裝的 App」模式開啟（主畫面圖示點進來的） */
function isStandalone(): boolean {
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		// iOS Safari 專屬屬性
		(navigator as { standalone?: boolean }).standalone === true
	);
}

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
	const ua = navigator.userAgent;
	if (/iPhone|iPad|iPod/.test(ua)) return "ios";
	if (/Android/.test(ua)) return "android";
	return "other";
}

/** Chrome/Edge 的 beforeinstallprompt 事件（TS 內建型別沒有它） */
interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
}

/** 個人資料：暱稱 + 大頭貼（Google 或自己上傳） */
function ProfileSection() {
	const { session, applySessionResponse } = useAuth();
	const [profile, setProfile] = useState<Profile | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [nickname, setNickname] = useState("");
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!session) return;
		getProfile(session.token)
			.then((p) => {
				setProfile(p);
				setNickname(p.nickname ?? "");
			})
			.catch((err: Error) => setLoadError(err.message));
	}, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

	if (!session) {
		return (
			<section className="install-section">
				<h2>👤 個人資料</h2>
				<p className="hint">登入後才能設定暱稱與大頭貼。</p>
			</section>
		);
	}

	async function save(data: { nickname?: string; avatar?: "google" | { base64: string } }) {
		if (!session) return;
		setSaving(true);
		setSaveError(null);
		setSaved(false);
		try {
			const result = await updateProfile(session.token, data);
			applySessionResponse(result);
			setProfile((prev) =>
				prev
					? { ...prev, nickname: result.profile.nickname, customAvatarUrl: result.profile.customAvatarUrl }
					: prev,
			);
			setNickname(result.profile.nickname ?? "");
			setSaved(true);
		} catch (err) {
			setSaveError((err as Error).message);
		} finally {
			setSaving(false);
		}
	}

	async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = ""; // 同一張圖可以重選
		if (!file) return;
		try {
			const dataUrl = await fileToSquareJpegDataUrl(file, 256);
			await save({ avatar: { base64: dataUrl } });
		} catch (err) {
			setSaveError((err as Error).message);
		}
	}

	const usingCustomAvatar = !!profile?.customAvatarUrl;

	return (
		<section className="install-section">
			<h2>👤 個人資料</h2>
			{loadError && <p className="error">載入失敗：{loadError}</p>}

			<div className="profile-avatar-row">
				<Avatar name={session.name} avatar={session.avatar} />
				<div className="profile-avatar-actions">
					<button type="button" disabled={saving} onClick={() => fileInput.current?.click()}>
						📷 上傳照片
					</button>
					{usingCustomAvatar && (
						<button type="button" disabled={saving} onClick={() => save({ avatar: "google" })}>
							改回 Google 大頭貼
						</button>
					)}
					<input
						ref={fileInput}
						type="file"
						accept="image/*"
						style={{ display: "none" }}
						onChange={onPickFile}
					/>
				</div>
			</div>

			<form
				className="profile-nickname-form"
				onSubmit={(e) => {
					e.preventDefault();
					void save({ nickname });
				}}
			>
				<label>
					暱稱（顯示在發文、留言、點菜；清空 = 用 Google 名字
					{profile ? `「${profile.googleName}」` : ""}）
					<input
						type="text"
						value={nickname}
						maxLength={20}
						placeholder={profile?.googleName ?? ""}
						onChange={(e) => setNickname(e.target.value)}
					/>
				</label>
				<button type="submit" disabled={saving || (profile ? nickname === (profile.nickname ?? "") : false)}>
					{saving ? "儲存中…" : "儲存暱稱"}
				</button>
			</form>

			{saved && <p className="hint">✅ 已儲存，之後的發文留言都會用新的名字/大頭貼。</p>}
			{saveError && <p className="error">{saveError}</p>}
		</section>
	);
}

/** 通知開關區塊：訂閱狀態 + 開啟/關閉按鈕 */
function NotificationSection({ installed, platform }: { installed: boolean; platform: Platform }) {
	const { session } = useAuth();
	const [subscribed, setSubscribed] = useState<boolean | null>(null); // null = 還在查
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		getCurrentSubscription()
			.then((sub) => setSubscribed(!!sub))
			.catch(() => setSubscribed(false));
	}, []);

	if (!pushSupported()) {
		// iOS 未安裝時整組 Push API 都不存在 → 引導先安裝，而不是說「不支援」
		if (platform === "ios" && !installed) {
			return (
				<section className="install-section">
					<h2>🔔 通知</h2>
					<p className="hint">iPhone 要先照下面步驟「加入主畫面」，再從主畫面開啟 App，才能開啟通知。</p>
				</section>
			);
		}
		return (
			<section className="install-section">
				<h2>🔔 通知</h2>
				<p className="hint">這個瀏覽器不支援推播通知。</p>
			</section>
		);
	}

	if (!session) {
		return (
			<section className="install-section">
				<h2>🔔 通知</h2>
				<p className="hint">登入後才能開啟通知。</p>
			</section>
		);
	}

	async function toggle() {
		if (!session) return;
		setBusy(true);
		setError(null);
		try {
			if (subscribed) {
				await disablePush(session.token);
				setSubscribed(false);
			} else {
				await enablePush(session.token);
				setSubscribed(true);
			}
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="install-section">
			<h2>🔔 通知</h2>
			<p className="hint">
				開啟後，這台裝置會收到：家人的新貼文與留言、點菜
				{session.isOwner ? "、還有新的登入申請（管理員限定）" : ""}。自己的動作不會通知自己。
			</p>
			<button type="button" disabled={busy || subscribed === null} onClick={toggle}>
				{subscribed === null ? "檢查中…" : busy ? "處理中…" : subscribed ? "🔕 關閉這台裝置的通知" : "🔔 開啟通知"}
			</button>
			{subscribed && <p className="hint">✅ 這台裝置已開啟通知。</p>}
			{error && <p className="error">{error}</p>}
		</section>
	);
}

/** 安裝教學（已安裝就收成一行確認） */
function InstallSection({
	installed,
	platform,
	installEvent,
}: {
	installed: boolean;
	platform: Platform;
	installEvent: BeforeInstallPromptEvent | null;
}) {
	if (installed) {
		return <p className="install-done">✅ 已安裝到主畫面，你現在就是從 App 開啟的。</p>;
	}
	return (
		<>
			{(platform === "ios" || platform === "other") && (
				<section className="install-section">
					<h2>📱 安裝到 iPhone / iPad（用 Safari 開啟）</h2>
					<ol>
						<li>
							點瀏覽器下方中間的 <strong>分享按鈕</strong>（□ 加向上箭頭）
						</li>
						<li>
							往下捲，點 <strong>「加入主畫面」</strong>
						</li>
						<li>
							右上角按 <strong>「新增」</strong>
						</li>
					</ol>
					<p className="hint">注意：要用 Safari 才有「加入主畫面」；用 LINE 或 FB 內建瀏覽器開的話，先點右下角「用 Safari 開啟」。</p>
				</section>
			)}

			{(platform === "android" || platform === "other") && (
				<section className="install-section">
					<h2>🤖 安裝到 Android（用 Chrome 開啟）</h2>
					{installEvent ? (
						<button type="button" onClick={() => installEvent.prompt()}>
							⬇️ 一鍵安裝
						</button>
					) : (
						<ol>
							<li>
								點右上角 <strong>⋮ 選單</strong>
							</li>
							<li>
								點 <strong>「加到主畫面」</strong>（或「安裝應用程式」）
							</li>
							<li>
								按 <strong>「安裝」</strong>
							</li>
						</ol>
					)}
				</section>
			)}
		</>
	);
}

export function Settings() {
	const [platform] = useState<Platform>(detectPlatform);
	const [installed] = useState<boolean>(isStandalone);
	const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

	useEffect(() => {
		const handler = (e: Event) => {
			e.preventDefault();
			setInstallEvent(e as BeforeInstallPromptEvent);
		};
		window.addEventListener("beforeinstallprompt", handler);
		return () => window.removeEventListener("beforeinstallprompt", handler);
	}, []);

	return (
		<div className="page install-page">
			<h1>設定</h1>
			<ProfileSection />
			<NotificationSection installed={installed} platform={platform} />
			<InstallSection installed={installed} platform={platform} installEvent={installEvent} />
		</div>
	);
}
