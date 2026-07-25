/**
 * 食譜圖（手寫食譜照片）的最長邊。比貼文圖的 1280 大一點，手寫字才看得清楚；
 * 但一定要縮——原圖直傳的年代平均一張 2.9 MB，17 張就吃掉整個 data repo 的 85%。
 */
export const RECIPE_IMAGE_MAX_SIDE = 1600;

/** 等比例縮小到最長邊 maxSide 的 JPEG data URL（貼文附圖／食譜圖用；比 maxSide 小就不放大）。 */
export function fileToResizedJpegDataUrl(file: File, maxSide = 1280): Promise<string> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(img.naturalWidth * scale);
			canvas.height = Math.round(img.naturalHeight * scale);
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Canvas not supported"));
				return;
			}
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			resolve(canvas.toDataURL("image/jpeg", 0.85));
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("讀不了這張圖片"));
		};
		img.src = url;
	});
}

/** 把照片裁成置中正方形並縮到 size×size 的 JPEG data URL（大頭貼用，避免整張原圖進 repo）。 */
export function fileToSquareJpegDataUrl(file: File, size = 256): Promise<string> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			const side = Math.min(img.naturalWidth, img.naturalHeight);
			const sx = (img.naturalWidth - side) / 2;
			const sy = (img.naturalHeight - side) / 2;
			const canvas = document.createElement("canvas");
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Canvas not supported"));
				return;
			}
			ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
			resolve(canvas.toDataURL("image/jpeg", 0.85));
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("讀不了這張圖片"));
		};
		img.src = url;
	});
}
