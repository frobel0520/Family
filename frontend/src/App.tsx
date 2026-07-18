import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Board } from "./pages/Board";
import { Recipes } from "./pages/Recipes";
import { Orders } from "./pages/Orders";
import { AuthCallback } from "./pages/AuthCallback";

function App() {
	return (
		<AuthProvider>
			<Layout>
				<Routes>
					<Route path="/" element={<Home />} />
					<Route path="/board" element={<Board />} />
					<Route path="/recipes" element={<Recipes />} />
					<Route path="/orders" element={<Orders />} />
					<Route path="/auth/callback" element={<AuthCallback />} />
				</Routes>
			</Layout>
		</AuthProvider>
	);
}

export default App;
