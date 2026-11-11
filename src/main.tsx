import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ViewNight } from "./components/view-night";
// Fonts are served from this site (not Google Fonts), so visitors' IP addresses stay here.
import "@fontsource/archivo-narrow/500.css";
import "@fontsource/archivo-narrow/600.css";
import "@fontsource/archivo-narrow/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import "./styles.css";

// A view-only link (#view=<token>) gets its own small read-only page instead of the planner.
const view = new URLSearchParams(location.hash.slice(1)).get("view");
createRoot(document.getElementById("root")!).render(<StrictMode>{view && /^[0-9a-f]{48}$/.test(view) ? <ViewNight token={view} /> : <App />}</StrictMode>);
