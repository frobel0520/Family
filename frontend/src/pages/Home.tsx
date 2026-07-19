import { Link } from "react-router-dom";

const ENTRIES = [
	{ to: "/board", icon: "📌", title: "佈告欄", desc: "看看家人留了什麼話" },
	{ to: "/recipes", icon: "🍳", title: "食譜", desc: "瀏覽或上傳家裡的食譜" },
	{ to: "/orders", icon: "🍽️", title: "點菜", desc: "今天想吃什麼？點起來" },
	{ to: "/install", icon: "📲", title: "安裝與通知", desc: "裝到主畫面、開啟新貼文/點菜通知" },
];

export function Home() {
	return (
		<div className="page">
			<h1>今天想做什麼？</h1>
			<div className="home-entries">
				{ENTRIES.map((entry) => (
					<Link key={entry.to} to={entry.to} className="home-entry">
						<span className="home-entry-icon">{entry.icon}</span>
						<div>
							<div className="home-entry-title">{entry.title}</div>
							<div className="home-entry-desc">{entry.desc}</div>
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}
