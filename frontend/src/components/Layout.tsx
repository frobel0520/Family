import type { ReactNode } from "react";
import { Nav } from "./Nav";

export function Layout({ children }: { children: ReactNode }) {
	return (
		<>
			<Nav />
			<main>{children}</main>
		</>
	);
}
