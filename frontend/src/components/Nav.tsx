import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Avatar } from "./Avatar";

const TABS = [
	{ to: "/", icon: "🏠", label: "首頁", end: true },
	{ to: "/board", icon: "📌", label: "佈告欄" },
	{ to: "/calendar", icon: "📅", label: "行事曆" },
	{ to: "/recipes", icon: "🍳", label: "食譜" },
	{ to: "/orders", icon: "🍽️", label: "點菜" },
];

export function Nav() {
	const { session, login, logout } = useAuth();
	const handleLogout = () => {
		logout().catch(() => {
			window.alert("登出失敗，請確認網路連線後再試一次。");
		});
	};
	const tabs = session?.isOwner ? [...TABS, { to: "/admin", icon: "🛡️", label: "審核" }] : TABS;

	return (
		<>
			<header className="header">
				<div className="brand">🏡 Family APP</div>

				<div className="nav-auth">
					{session ? (
						<>
							<Avatar name={session.name} avatar={session.avatar} className="nav-avatar" />
							<span className="username">{session.name}</span>
							<button type="button" className="logout" onClick={handleLogout}>
								登出
							</button>
						</>
					) : (
						<button type="button" onClick={login}>
							登入
						</button>
					)}
				</div>
			</header>

			<nav className="tabs">
				{tabs.map((tab) => (
					<NavLink key={tab.to} to={tab.to} end={tab.end}>
						<span className="tab-icon">{tab.icon}</span>
						{tab.label}
					</NavLink>
				))}
			</nav>
		</>
	);
}
