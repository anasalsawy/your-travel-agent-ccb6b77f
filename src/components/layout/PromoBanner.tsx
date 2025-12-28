import { useState } from "react";
import { X, Plane } from "lucide-react";
import { Link } from "react-router-dom";

export function PromoBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-primary text-primary-foreground relative">
      <div className="container mx-auto px-4 py-2.5 flex items-center justify-center gap-2 text-sm md:text-base">
        <Plane className="h-4 w-4 shrink-0 hidden sm:block" />
        <p className="text-center">
          <span className="font-semibold">Domestic Flights Special:</span>{" "}
          <span className="hidden sm:inline">All seats </span>
          <span className="font-bold">$199 Economy</span> | <span className="font-bold">$399 Business/First</span>
          <span className="hidden md:inline"> — Valid until Dec 31</span>
          <Link 
            to="/request-ticket" 
            className="ml-2 underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Book now →
          </Link>
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-2 md:right-4 p-1 hover:opacity-70 transition-opacity"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
