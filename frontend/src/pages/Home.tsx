import { Link } from "react-router-dom";
import { HomeSetupCards } from "../components/HomeSetupCards";
import { CalendarIcon, ChefHatIcon, ChevronRightIcon, PinIcon, SlidersIcon, UtensilsIcon } from "../components/Icons";

const ENTRIES = [
	{ to: "/board", icon: <PinIcon />, title: "佈告欄", desc: "看看家人留了什麼話" },
	{ to: "/calendar", icon: <CalendarIcon />, title: "行事曆", desc: "家庭活動、生日、提醒" },
	{ to: "/recipes", icon: <ChefHatIcon />, title: "食譜", desc: "瀏覽或上傳家裡的食譜" },
	{ to: "/orders", icon: <UtensilsIcon />, title: "點菜", desc: "今天想吃什麼？點起來" },
	{ to: "/settings", icon: <SlidersIcon />, title: "設定", desc: "暱稱、大頭貼、通知、安裝到手機" },
];

export function Home() {
	return (
		<div className="page">
			<h1>今天想做什麼？</h1>
			<HomeSetupCards />
			<div className="home-entries">
				{ENTRIES.map((entry) => (
					<Link key={entry.to} to={entry.to} className="home-entry">
						<span className="home-entry-icon">{entry.icon}</span>
						<div className="home-entry-text">
							<div className="home-entry-title">{entry.title}</div>
							<div className="home-entry-desc">{entry.desc}</div>
						</div>
						<span className="home-entry-chevron">
							<ChevronRightIcon />
						</span>
					</Link>
				))}
			</div>
		</div>
	);
}
