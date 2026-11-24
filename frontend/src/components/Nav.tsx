import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Avatar } from "./Avatar";
import { CalendarIcon, ChefHatIcon, HomeIcon, PinIcon, ShieldIcon, UtensilsIcon } from "./Icons";

const TABS = [
	{ to: "/", icon: <HomeIcon />, label: "首頁", end: true },
	{ to: "/board", icon: <PinIcon />, label: "佈告欄" },
	{ to: "/calendar", icon: <CalendarIcon />, label: "行事曆" },
	{ to: "/recipes", icon: <ChefHatIcon />, label: "食譜" },
	{ to: "/orders", icon: <UtensilsIcon />, label: "點菜" },
];

export function Nav() {
	const { session, login, logout } = useAuth();
	const [logoutError, setLogoutError] = useState(false);
	const handleLogout = () => {
		setLogoutError(false);
		logout().catch(() => {
			// 不用 window.alert：非阻塞提示，使用者可以繼續操作或關閉
			setLogoutError(true);
		});
	};
	const tabs = session?.isOwner ? [...TABS, { to: "/admin", icon: <ShieldIcon />, label: "審核" }] : TABS;

	return (
		<>
			<header className="header">
				<div className="brand">Family APP</div>

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

			{logoutError ? (
				<div className="logout-error" role="alert">
					<span>登出失敗，請確認網路連線後再試一次。</span>
					<button type="button" onClick={() => setLogoutError(false)}>
						關閉
					</button>
				</div>
			) : null}

			<nav className="tabs">
				{tabs.map((tab) => (
					<NavLink key={tab.to} to={tab.to} end={tab.end}>
						{tab.icon}
						{tab.label}
					</NavLink>
				))}
			</nav>
		</>
	);
}
