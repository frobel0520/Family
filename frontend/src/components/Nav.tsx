import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Nav() {
	const { session, login, logout } = useAuth();

	return (
		<nav className="nav">
			<div className="nav-links">
				<NavLink to="/" end>
					首頁
				</NavLink>
				<NavLink to="/board">佈告欄</NavLink>
				<NavLink to="/recipes">食譜庫</NavLink>
				<NavLink to="/orders">點菜</NavLink>
			</div>

			<div className="nav-auth">
				{session ? (
					<>
						<img src={session.avatar} alt={session.username} className="nav-avatar" />
						<span>{session.username}</span>
						<button type="button" onClick={logout}>
							登出
						</button>
					</>
				) : (
					<button type="button" onClick={login}>
						登入
					</button>
				)}
			</div>
		</nav>
	);
}
