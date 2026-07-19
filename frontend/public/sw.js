/* Family App Service Worker
 * v1：不做離線快取（避免快取舊版前端的坑），單純讓 PWA 可安裝，
 * 並預留推播事件處理（第二階段接 Web Push 時會用到）。 */

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

// 推播：顯示通知（payload 由 Worker 端送 JSON：{ title, body, url }）
self.addEventListener("push", (event) => {
	if (!event.data) return;
	let payload;
	try {
		payload = event.data.json();
	} catch {
		payload = { title: "Family", body: event.data.text() };
	}
	event.waitUntil(
		self.registration.showNotification(payload.title ?? "Family", {
			body: payload.body ?? "",
			icon: "/Family/icon-192.png",
			badge: "/Family/icon-192.png",
			data: { url: payload.url ?? "/Family/" },
		}),
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
