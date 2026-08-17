import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

// The PWA/service worker is only intended for the /m mobile-admin app.
// On the public site a stale SW was serving the previous homepage build
// to returning browser visitors — unregister it and purge caches here.
if (typeof window !== "undefined" && !window.location.pathname.startsWith("/m")) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
  }
  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  }
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
