import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { detectPlatform, isIosNonSafari, isStandalone, useInstallPrompt } from "../install";
import { enablePush, getCurrentSubscription, pushSupported } from "../push";

/**
 * 首頁的「設定小幫手」卡片：從舊網址搬過來的家人，不用自己去設定頁找就能完成
 * 「安裝到主畫面」與「開啟通知」。完成或按「稍後再說」後就不再顯示。
 */

// 只記這台裝置是否按過「稍後再說」（個人偏好，不是重要狀態）；讀寫失敗就當沒按過。
const INSTALL_DISMISSED_KEY = "family-install-card-dismissed";

function readDismissed(): boolean {
	try {
		return localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
	} catch {
		return false;
	}
}

function writeDismissed(): void {
	try {
		localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
	} catch {
		// 隱私模式等情況存不了：這次關掉就好，下次開啟會再出現
	}
}

function InstallCard() {
	const installEvent = useInstallPrompt();
	const [platform] = useState(detectPlatform);
	const [installed] = useState(isStandalone);
	const [dismissed, setDismissed] = useState(readDismissed);
	const [error, setError] = useState<string | null>(null);

	// 電腦版不主動提示；已從主畫面開啟或按過稍後再說也不顯示。
	if (installed || dismissed || platform === "other") return null;

	function dismiss() {
		writeDismissed();
		setDismissed(true);
	}

	async function install() {
		if (!installEvent) return;
		setError(null);
		try {
			await installEvent.prompt();
		} catch (err) {
			setError(`沒有開啟安裝視窗：${(err as Error).message}`);
		}
	}

	return (
		<section className="install-section setup-card">
			<h2>📱 把 Family 加到手機主畫面</h2>
			{platform === "android" && installEvent && (
				<>
					<p>點下面的按鈕，再按「安裝」就完成了。</p>
					<button type="button" className="setup-card-primary" onClick={install}>
						⬇️ 一鍵安裝
					</button>
				</>
			)}
			{platform === "android" && !installEvent && (
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
			{platform === "ios" && isIosNonSafari() && (
				<p>
					現在不是用 Safari 開的，沒辦法加到主畫面。請點右下角或右上角的選單，選 <strong>「用 Safari 開啟」</strong>
					，再照畫面提示加入主畫面。
				</p>
			)}
			{platform === "ios" && !isIosNonSafari() && (
				<ol>
					<li>
						點畫面下方的 <strong>分享按鈕</strong>（方框加向上箭頭 ⬆️）
					</li>
					<li>
						往下滑，點 <strong>「加入主畫面」</strong>
					</li>
					<li>
						右上角按 <strong>「新增」</strong>
					</li>
				</ol>
			)}
			<p className="hint">加好之後，之後都從主畫面的 Family 圖示打開；舊的 Family 圖示可以長按刪掉。</p>
			{error && <p className="error">{error}</p>}
			<button type="button" className="setup-card-later" onClick={dismiss}>
				稍後再說
			</button>
		</section>
	);
}

function NotificationCard() {
	const { session } = useAuth();
	const [needsSetup, setNeedsSetup] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		// iPhone 未安裝時沒有 Push API，安裝卡片會先引導；權限被拒絕時瀏覽器不會再詢問，交給設定頁說明。
		if (!session || !pushSupported() || Notification.permission === "denied") return;
		let active = true;
		getCurrentSubscription()
			.then((subscription) => {
				if (active) setNeedsSetup(subscription === null);
			})
			.catch((err: Error) => {
				if (active) setError(`無法確認通知狀態：${err.message}`);
			});
		return () => {
			active = false;
		};
	}, [session]);

	if (!session || (!needsSetup && !error)) return null;

	async function turnOn() {
		setBusy(true);
		setError(null);
		try {
			await enablePush();
			setNeedsSetup(false);
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="install-section setup-card">
			<h2>🔔 開啟通知</h2>
			<p>家人有新貼文、留言或點菜時，這台手機會跳出通知。</p>
			{needsSetup && (
				<button type="button" className="setup-card-primary" disabled={busy} onClick={turnOn}>
					{busy ? "處理中…" : "🔔 開啟通知"}
				</button>
			)}
			{error && <p className="error">{error}</p>}
		</section>
	);
}

export function HomeSetupCards() {
	return (
		<div className="setup-cards">
			<InstallCard />
			<NotificationCard />
		</div>
	);
}
