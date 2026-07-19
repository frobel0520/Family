import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const TABS = [
	{ to: "/", icon: "🏠", label: "首頁", end: true },
	{ to: "/board", icon: "📌", label: "佈告欄" },
	{ to: "/recipes", icon: "🍳", label: "食譜" },
	{ to: "/orders", icon: "🍽️", label: "點菜" },
];

export function Nav() {
	const { session, login, logout } = useAuth();
	const tabs = session?.isOwner ? [...TABS, { to: "/admin", icon: "🛡️", label: "審核" }] : TABS;

	return (
		<>
			<header className="header">
				<div className="brand">🏡 Family APP</div>

				<div className="nav-auth">
					{session ? (
						<>
							<img src={session.avatar} alt={session.name} className="nav-avatar" />
							<span className="username">{session.name}</span>
							<button type="button" className="logout" onClick={logout}>
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
