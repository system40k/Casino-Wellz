import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

import { assertSafeRuntimeConfiguration } from "./config/runtime";
import reportWebVitals from "./sdk/core/internal/reportWebVitals.ts";
import "./styles.css";

// Initialize Creao platform SDK
import { APP_CONFIG } from "./sdk/core/global.ts";
export { APP_CONFIG }; // for backward compatibility

// Production deployments must fail closed when the authoritative backend
// configuration is missing or insecure.
assertSafeRuntimeConfiguration();

// Create a QueryClient instance
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000, // 5 minutes
			gcTime: 10 * 60 * 1000, // 10 minutes (previously cacheTime)
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

// Create a new router instance
const router = createRouter({
	routeTree,
	context: {} as any,
	defaultPreload: "intent",
	scrollRestoration: true,
	defaultStructuralSharing: true,
	defaultPreloadStaleTime: 0,
	basepath: import.meta.env.TENANT_ID ? `/${import.meta.env.TENANT_ID}` : "/",
} as any);

// Declare the router context type for TanStack Router
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

// Declare the context type
declare global {
	interface RouterContext {
		queryClient: QueryClient;
	}
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</StrictMode>,
	);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
