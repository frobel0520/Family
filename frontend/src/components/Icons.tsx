import type { ReactNode } from "react";

/**
 * 介面圖示（24×24 線條圖示，顏色跟隨文字色），風格與 nihongo-lab 一致。
 * 裝飾用，文字說明由旁邊的標籤或 aria-label 提供，所以圖示本身 aria-hidden。
 */
function Icon({ children }: { children: ReactNode }) {
	return (
		<svg
			className="icon"
			viewBox="0 0 24 24"
			width="24"
			height="24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{children}
		</svg>
	);
}

export const HomeIcon = () => (
	<Icon>
		<path d="M3 10.5 12 3l9 7.5" />
		<path d="M5 9v11h14V9" />
		<path d="M10 20v-6h4v6" />
	</Icon>
);

export const PinIcon = () => (
	<Icon>
		<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
		<path d="M12 14v7" />
	</Icon>
);

export const CalendarIcon = () => (
	<Icon>
		<rect x="3" y="5" width="18" height="16" rx="2.5" />
		<path d="M3 10h18M8 3v4M16 3v4" />
	</Icon>
);

export const ChefHatIcon = () => (
	<Icon>
		<path d="M6 14a4 4 0 0 1-.4-7.98A5 5 0 0 1 12 3a5 5 0 0 1 6.4 3.02A4 4 0 0 1 18 14" />
		<path d="M6 14v6h12v-6M6 17h12" />
	</Icon>
);

export const UtensilsIcon = () => (
	<Icon>
		<path d="M5 3v6a3 3 0 0 0 6 0V3M8 3v18" />
		<path d="M19 21V3c-2.2 1.4-3.5 4-3.5 7.5V14H19" />
	</Icon>
);

export const SlidersIcon = () => (
	<Icon>
		<path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
		<circle cx="16" cy="7" r="2.5" />
		<circle cx="8" cy="17" r="2.5" />
	</Icon>
);

export const ShieldIcon = () => (
	<Icon>
		<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />
		<path d="M9 12l2 2 4-4" />
	</Icon>
);

export const UserIcon = () => (
	<Icon>
		<circle cx="12" cy="8" r="4" />
		<path d="M4 21a8 8 0 0 1 16 0" />
	</Icon>
);

export const PaletteIcon = () => (
	<Icon>
		<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 21 9.7C21 5.9 17 3 12 3z" />
		<circle cx="7.5" cy="11.5" r="1" />
		<circle cx="10" cy="7" r="1" />
		<circle cx="15" cy="7.5" r="1" />
	</Icon>
);

export const BellIcon = () => (
	<Icon>
		<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" />
		<path d="M10 21h4" />
	</Icon>
);

export const BellOffIcon = () => (
	<Icon>
		<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" />
		<path d="M10 21h4M3 3l18 18" />
	</Icon>
);

export const PhoneIcon = () => (
	<Icon>
		<rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
		<path d="M11 18h2" />
	</Icon>
);

export const DownloadIcon = () => (
	<Icon>
		<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
	</Icon>
);

export const CameraIcon = () => (
	<Icon>
		<path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.5l2-2.5h5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z" />
		<circle cx="12" cy="13" r="3.5" />
	</Icon>
);

export const BookIcon = () => (
	<Icon>
		<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
		<path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
		<path d="M9 8h7" />
	</Icon>
);

export const SunIcon = () => (
	<Icon>
		<circle cx="12" cy="12" r="4" />
		<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
	</Icon>
);

export const MoonIcon = () => (
	<Icon>
		<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
	</Icon>
);

export const AutoThemeIcon = () => (
	<Icon>
		<circle cx="12" cy="12" r="9" />
		<path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
	</Icon>
);

export const CheckIcon = () => (
	<Icon>
		<path d="M5 12.5l4.5 4.5L19 7.5" />
	</Icon>
);

export const ChevronRightIcon = () => (
	<Icon>
		<path d="M9 5l7 7-7 7" />
	</Icon>
);
