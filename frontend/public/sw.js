/* Family App Service Worker
 * v1：不做離線快取（避免快取舊版前端的坑），單純讓 PWA 可安裝，
 * 並預留推播事件處理（第二階段接 Web Push 時會用到）。 */

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

// 推播：顯示通知（payload 由 Worker 端送 JSON：{ title, body, url, tag, icon }）
// 同 tag（board/orders/admin）的通知摺疊成一則，內文顯示累計數。
self.addEventListener("push", (event) => {
	if (!event.data) return;
	let payload;
	try {
		payload = event.data.json();
	} catch {
		payload = { title: "Family", body: event.data.text() };
	}
	const tag = payload.tag || "family";
	event.waitUntil(
		(async () => {
			// 同 tag 已有未讀 → 疊加計數（新通知會直接取代舊的那則）
			const existing = await self.registration.getNotifications({ tag });
			const count = (existing[0]?.data?.count ?? 0) + 1;
			const body = count > 1 ? `${payload.body ?? ""}\n（還有 ${count - 1} 則較早的通知）` : (payload.body ?? "");
			await self.registration.showNotification(payload.title ?? "Family", {
				body,
				tag,
				// 縮圖：觸發者的大頭貼；badge 是狀態列的單色剪影（Android 用；iOS 都不支援、固定顯示 App 圖示）
				icon: payload.icon || "/Family/icon-192.png",
				badge: "/Family/badge.png",
				data: { url: payload.url ?? "/Family/", count },
			});
		})(),
	);
});

// 點通知：聚焦既有視窗或開新視窗
self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = event.notification.data?.url ?? "/Family/";
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
			for (const client of clients) {
				if (client.url.includes("/Family/") && "focus" in client) {
					client.navigate(url);
					return client.focus();
				}
			}
			return self.clients.openWindow(url);
		}),
	);
});
