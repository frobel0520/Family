import { useEffect, useState } from "react";

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

export function Install() {
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

	if (installed) {
		return (
			<div className="page install-page">
				<h1>安裝到手機</h1>
				<p className="install-done">✅ 已經安裝好了！你現在就是從主畫面的 App 開啟的。</p>
			</div>
		);
	}

	return (
		<div className="page install-page">
			<h1>安裝到手機</h1>
			<p className="hint">安裝後，主畫面會出現 Family 的圖示，點開就是全螢幕 App，之後還能收到通知。</p>

			{(platform === "ios" || platform === "other") && (
				<section className="install-section">
					<h2>📱 iPhone / iPad（用 Safari 開啟）</h2>
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
					<h2>🤖 Android（用 Chrome 開啟）</h2>
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
		</div>
	);
}
