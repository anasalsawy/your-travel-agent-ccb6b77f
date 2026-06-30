export type FlightProvider = "duffel" | "trawex";

export function resolveFlightProvider(requested?: string | null): FlightProvider {
  const normalized = (requested || "").toLowerCase().trim();
  if (normalized === "duffel" || normalized === "trawex") return normalized;

  const envDefault = (Deno.env.get("BOOKING_PROVIDER_DEFAULT") || "duffel").toLowerCase().trim();
  if (envDefault === "trawex") return "trawex";
  return "duffel";
}

export function shouldFallbackToDuffel(payload: any): boolean {
  if (typeof payload?.allow_fallback === "boolean") return payload.allow_fallback;
  return true;
}
