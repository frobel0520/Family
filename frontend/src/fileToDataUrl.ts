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

export function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
		reader.readAsDataURL(file);
	});
}
