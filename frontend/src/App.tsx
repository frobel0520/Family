import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import "./App.css";
import { AuthProvider } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Board } from "./pages/Board";
import { Recipes } from "./pages/Recipes";
import { Orders } from "./pages/Orders";
import { Admin } from "./pages/Admin";
import { AuthCallback } from "./pages/AuthCallback";

function App() {
	// Google's OAuth redirect lands on the exact registered page (no #fragment),
	// e.g. "/Family/?code=...". Handle that before the (hash-based) router mounts.
	const [pendingCallback, setPendingCallback] = useState(() => new URLSearchParams(window.location.search).has("code"));

	return (
		<AuthProvider>
			{pendingCallback ? (
				<AuthCallback onDone={() => setPendingCallback(false)} />
			) : (
				<Layout>
					<Routes>
						<Route path="/" element={<Home />} />
						<Route path="/board" element={<Board />} />
						<Route path="/recipes" element={<Recipes />} />
						<Route path="/orders" element={<Orders />} />
						<Route path="/admin" element={<Admin />} />
					</Routes>
				</Layout>
			)}
		</AuthProvider>
	);
}

export default App;
