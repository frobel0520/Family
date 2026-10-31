import { useEffect, useState } from "react";

/** 是否已經以「已安裝的 App」模式開啟（主畫面圖示點進來的） */
export function isStandalone(): boolean {
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		// iOS Safari 專屬屬性
		(navigator as { standalone?: boolean }).standalone === true
	);
}

export type Platform = "ios" | "android" | "other";

export function detectPlatform(): Platform {
	const ua = navigator.userAgent;
	if (/iPhone|iPad|iPod/.test(ua)) return "ios";
	if (/Android/.test(ua)) return "android";
	return "other";
}

/**
 * iPhone 上只有 Safari 能「加入主畫面」。LINE、FB、IG 內建瀏覽器與 Chrome／Firefox／Edge for iOS
 * 都沒有這個選項，要先請使用者改用 Safari 開啟。
 */
export function isIosNonSafari(): boolean {
	return /Line\/|FBAN|FBAV|Instagram|CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
}

/** Chrome/Edge 的 beforeinstallprompt 事件（TS 內建型別沒有它） */
export interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
}

/**
 * beforeinstallprompt 只在頁面載入初期觸發一次；等使用者切到某個頁面才掛 listener 會錯過。
 * 所以在 main.tsx 啟動時就呼叫 captureInstallPrompt()，事件存在這裡，各頁面用 useInstallPrompt() 取用。
 */
let capturedInstallEvent: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(event: BeforeInstallPromptEvent | null) => void>();

function publishInstallEvent(event: BeforeInstallPromptEvent | null): void {
	capturedInstallEvent = event;
	for (const listener of installListeners) listener(event);
}

export function captureInstallPrompt(): void {
	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		publishInstallEvent(event as BeforeInstallPromptEvent);
	});
	// 安裝完成後瀏覽器不會再讓同一個事件提示一次，清掉避免畫面上留著沒作用的按鈕。
	window.addEventListener("appinstalled", () => publishInstallEvent(null));
}

export function useInstallPrompt(): BeforeInstallPromptEvent | null {
	const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(capturedInstallEvent);

	useEffect(() => {
		installListeners.add(setInstallEvent);
		return () => {
			installListeners.delete(setInstallEvent);
		};
	}, []);

	return installEvent;
}
