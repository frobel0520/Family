import { useState } from "react";

/** 圓形頭像；沒有網址或圖片載入失敗時顯示名字首字。 */
export function Avatar({
	name,
	avatar,
	className = "user-avatar",
}: {
	name: string;
	avatar?: string | null;
	className?: string;
}) {
	const [failedAvatar, setFailedAvatar] = useState<string | null>(null);

	if (avatar && failedAvatar !== avatar) {
		return (
			<img
				className={className}
				src={avatar}
				alt={name}
				referrerPolicy="no-referrer"
				onError={() => setFailedAvatar(avatar)}
			/>
		);
	}
	return (
		<span className={`${className} user-avatar-fallback`} aria-hidden>
			{name.trim().charAt(0) || "?"}
		</span>
	);
}
