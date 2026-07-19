/** 圓形頭像；沒有頭像網址（舊資料）就顯示名字首字。 */
export function Avatar({ name, avatar }: { name: string; avatar?: string }) {
	if (avatar) {
		return <img className="user-avatar" src={avatar} alt={name} referrerPolicy="no-referrer" />;
	}
	return (
		<span className="user-avatar user-avatar-fallback" aria-hidden>
			{name.trim().charAt(0) || "?"}
		</span>
	);
}
