import { useState, useEffect } from "react";
import { X, Plane } from "lucide-react";
import { Link } from "react-router-dom";

const BANNER_DISMISSED_KEY = "promo-banner-dismissed";

export function PromoBanner() {
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem(BANNER_DISMISSED_KEY) === "true";
  });

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, "true");
  };

  // Communicate banner height to layout via CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--promo-banner-height",
      dismissed ? "0px" : "40px"
    );
    return () => {
      document.documentElement.style.setProperty("--promo-banner-height", "0px");
    };
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div className="bg-primary text-primary-foreground sticky top-0 z-[60] animate-pulse-glow">
      <div className="container mx-auto px-4 py-2.5 flex items-center justify-center gap-2 text-sm md:text-base">
        <Plane className="h-4 w-4 shrink-0 hidden sm:block" />
        <p className="text-center pr-6">
          <span className="font-bold">Name Your Price</span>
          <span className="hidden sm:inline"> — Set your budget, sellers compete, pay even less</span>
          <span className="sm:hidden"> — Pay less than you ask!</span>
          <Link 
            to="/request-ticket" 
            className="ml-2 underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Try it →
          </Link>
        </p>
        <button
          onClick={handleDismiss}
          className="absolute right-2 md:right-4 p-1 hover:opacity-70 transition-opacity"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
