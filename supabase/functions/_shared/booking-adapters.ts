// Provider-agnostic booking adapters.
// Current policy:
// - Flights: Trawex when configured, otherwise Duffel fallback.
// - Hotels/Cars: Trawex only by default (no Duffel fallback unless explicitly overridden).

export type Product = "flights" | "hotels" | "cars";

const FUNCTIONS_URL = Deno.env.get("SUPABASE_URL")! + "/functions/v1";
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callInternal(fn: string, body: unknown) {
  const r = await fetch(FUNCTIONS_URL + "/" + fn, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: "Bearer " + SVC,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* keep raw */ }
  return { status: r.status, ok: r.ok, data };
}

export interface BookingAdapter {
  name: string;
  search(product: Product, params: Record<string, unknown>): Promise<unknown>;
  create(product: Product, params: Record<string, unknown>): Promise<unknown>;
  cancel(product: Product, params: Record<string, unknown>): Promise<unknown>;
  modify(product: Product, params: Record<string, unknown>): Promise<unknown>;
  get(product: Product, params: Record<string, unknown>): Promise<unknown>;
}

// Minimal IATA → coords for common airports so agents can pass 3-letter codes.
const IATA_COORDS: Record<string, { latitude: number; longitude: number }> = {
  CAI: { latitude: 30.1219, longitude: 31.4056 },
  DXB: { latitude: 25.2532, longitude: 55.3657 },
  SHJ: { latitude: 25.3286, longitude: 55.5172 },
  IAH: { latitude: 29.9902, longitude: -95.3368 },
  JFK: { latitude: 40.6413, longitude: -73.7781 },
  LHR: { latitude: 51.4700, longitude: -0.4543 },
  DOH: { latitude: 25.2731, longitude: 51.6080 },
  MCT: { latitude: 23.5933, longitude: 58.2844 },
};
function resolveLoc(v: unknown) {
  if (typeof v === "string" && IATA_COORDS[v.toUpperCase()]) return IATA_COORDS[v.toUpperCase()];
  if (v && typeof v === "object") return v;
  return v;
}
function normHotels(p: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...p };
  if (p.check_in && !p.check_in_date) out.check_in_date = p.check_in;
  if (p.check_out && !p.check_out_date) out.check_out_date = p.check_out;
  if (typeof p.location === "string" && IATA_COORDS[(p.location as string).toUpperCase()]) {
    const c = IATA_COORDS[(p.location as string).toUpperCase()];
    out.latitude = c.latitude; out.longitude = c.longitude;
    delete out.location;
  }
  if (typeof p.guests === "number") {
    out.guests = Array.from({ length: p.guests as number }, () => ({ type: "adult" }));
  }
  return out;
}
function normCars(p: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...p };
  out.pickup_location = resolveLoc(p.pickup_location);
  out.dropoff_location = resolveLoc(p.dropoff_location);
  const split = (v: unknown) => {
    if (typeof v !== "string") return null;
    if (v.includes("T")) { const [d, t] = v.split("T"); return { date: d, time: (t || "10:00").slice(0, 5) }; }
    return { date: v, time: "10:00" };
  };
  if (!p.pickup_time) { const s = split(p.pickup_date); if (s) { out.pickup_date = s.date; out.pickup_time = s.time; } }
  if (!p.dropoff_time) { const s = split(p.dropoff_date); if (s) { out.dropoff_date = s.date; out.dropoff_time = s.time; } }
  return out;
}

export const duffelAdapter: BookingAdapter = {
  name: "duffel",
  async search(product, params) {
    if (product === "flights") return callInternal("duffel-search", params);
    if (product === "hotels")  return callInternal("duffel-stays-search", normHotels(params));
    if (product === "cars")    return callInternal("duffel-cars-search", normCars(params));
    throw new Error("unknown product");
  },
  async create(product, params) {
    if (product === "flights") {
      // Frontend "continue to payment" starts from an offer, not a booking row id.
      // Route by payload shape to prevent "booking_id required" failures.
      const bookingId = typeof params?.booking_id === "string" ? params.booking_id : "";
      const offerId =
        (typeof params?.offer_id === "string" && params.offer_id) ||
        (typeof params?.id === "string" && params.id) ||
        "";
      if (bookingId) return callInternal("duffel-book", params);
      if (offerId) return callInternal("duffel-create-checkout", { ...params, offer_id: offerId });
      return {
        status: 400,
        ok: false,
        data: { error: "offer_id or booking_id required for flights create" },
      };
    }
    if (product === "hotels")  return callInternal("duffel-stays-book", params);
    if (product === "cars")    return callInternal("duffel-cars-book", params);
    throw new Error("unknown product");
  },
  async cancel(product, params) {
    if (product === "flights") return callInternal("duffel-order-cancel", params);
    if (product === "cars")    return callInternal("duffel-cars-cancel", params);
    // hotels cancel via duffel-stays-book with cancel action or dedicated fn — TODO
    return { status: 501, ok: false, data: { error: "hotel cancel not implemented for duffel yet" } };
  },
  async modify(_product, _params) {
    // Duffel supports order-change flow for flights; deferred until Trawex parity
    return { status: 501, ok: false, data: { error: "modify not implemented — use cancel + rebook" } };
  },
  async get(product, params) {
    if (product === "flights") return callInternal("duffel-order-get", params);
    if (product === "hotels")  return callInternal("duffel-stays-booking", params);
    if (product === "cars")    return callInternal("duffel-cars-booking", params);
    throw new Error("unknown product");
  },
};

const TRAWEX_BASE_URL = (Deno.env.get("TRAWEX_BASE_URL") ?? "").replace(/\/$/, "");
const TRAWEX_API_KEY = Deno.env.get("TRAWEX_API_KEY") ?? "";
const TRAWEX_AUTH_HEADER = Deno.env.get("TRAWEX_AUTH_HEADER") ?? "x-api-key";
const TRAWEX_FLIGHTS_SEARCH_PATH = Deno.env.get("TRAWEX_FLIGHTS_SEARCH_PATH") ?? Deno.env.get("TRAWEX_SEARCH_PATH") ?? "/api/flights/search";
const TRAWEX_FLIGHTS_CREATE_PATH = Deno.env.get("TRAWEX_FLIGHTS_CREATE_PATH") ?? Deno.env.get("TRAWEX_CREATE_PATH") ?? "/api/flights/book";
const TRAWEX_FLIGHTS_CANCEL_PATH = Deno.env.get("TRAWEX_FLIGHTS_CANCEL_PATH") ?? Deno.env.get("TRAWEX_CANCEL_PATH") ?? "/api/flights/cancel";
const TRAWEX_FLIGHTS_MODIFY_PATH = Deno.env.get("TRAWEX_FLIGHTS_MODIFY_PATH") ?? Deno.env.get("TRAWEX_MODIFY_PATH") ?? "/api/flights/modify";
const TRAWEX_FLIGHTS_GET_PATH = Deno.env.get("TRAWEX_FLIGHTS_GET_PATH") ?? Deno.env.get("TRAWEX_GET_PATH") ?? "/api/flights/get";

const TRAWEX_HOTELS_SEARCH_PATH = Deno.env.get("TRAWEX_HOTELS_SEARCH_PATH") ?? "/api/hotels/search";
const TRAWEX_HOTELS_CREATE_PATH = Deno.env.get("TRAWEX_HOTELS_CREATE_PATH") ?? "/api/hotels/book";
const TRAWEX_HOTELS_CANCEL_PATH = Deno.env.get("TRAWEX_HOTELS_CANCEL_PATH") ?? "/api/hotels/cancel";
const TRAWEX_HOTELS_MODIFY_PATH = Deno.env.get("TRAWEX_HOTELS_MODIFY_PATH") ?? "/api/hotels/modify";
const TRAWEX_HOTELS_GET_PATH = Deno.env.get("TRAWEX_HOTELS_GET_PATH") ?? "/api/hotels/get";

const TRAWEX_CARS_SEARCH_PATH = Deno.env.get("TRAWEX_CARS_SEARCH_PATH") ?? "/api/cars/search";
const TRAWEX_CARS_CREATE_PATH = Deno.env.get("TRAWEX_CARS_CREATE_PATH") ?? "/api/cars/book";
const TRAWEX_CARS_CANCEL_PATH = Deno.env.get("TRAWEX_CARS_CANCEL_PATH") ?? "/api/cars/cancel";
const TRAWEX_CARS_MODIFY_PATH = Deno.env.get("TRAWEX_CARS_MODIFY_PATH") ?? "/api/cars/modify";
const TRAWEX_CARS_GET_PATH = Deno.env.get("TRAWEX_CARS_GET_PATH") ?? "/api/cars/get";
const TRAWEX_TIMEOUT_MS = Math.max(1000, Number(Deno.env.get("TRAWEX_TIMEOUT_MS") ?? "12000"));
const TRAWEX_MAX_RETRIES = Math.max(0, Number(Deno.env.get("TRAWEX_MAX_RETRIES") ?? "2"));
const TRAWEX_RETRY_BASE_MS = Math.max(100, Number(Deno.env.get("TRAWEX_RETRY_BASE_MS") ?? "350"));
const TRAWEX_RETRY_MAX_MS = Math.max(TRAWEX_RETRY_BASE_MS, Number(Deno.env.get("TRAWEX_RETRY_MAX_MS") ?? "4000"));
const TRAWEX_RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function trawexReady() {
  return !!TRAWEX_BASE_URL && !!TRAWEX_API_KEY;
}

function trawexPaths(product: Product) {
  if (product === "flights") {
    return {
      search: TRAWEX_FLIGHTS_SEARCH_PATH,
      create: TRAWEX_FLIGHTS_CREATE_PATH,
      cancel: TRAWEX_FLIGHTS_CANCEL_PATH,
      modify: TRAWEX_FLIGHTS_MODIFY_PATH,
      get: TRAWEX_FLIGHTS_GET_PATH,
    };
  }
  if (product === "hotels") {
    return {
      search: TRAWEX_HOTELS_SEARCH_PATH,
      create: TRAWEX_HOTELS_CREATE_PATH,
      cancel: TRAWEX_HOTELS_CANCEL_PATH,
      modify: TRAWEX_HOTELS_MODIFY_PATH,
      get: TRAWEX_HOTELS_GET_PATH,
    };
  }
  return {
    search: TRAWEX_CARS_SEARCH_PATH,
    create: TRAWEX_CARS_CREATE_PATH,
    cancel: TRAWEX_CARS_CANCEL_PATH,
    modify: TRAWEX_CARS_MODIFY_PATH,
    get: TRAWEX_CARS_GET_PATH,
  };
}

function safeDiagnostic(message: string, status?: number) {
  const compact = message.replace(/\s+/g, " ").trim().slice(0, 240);
  return status ? `${compact} (status=${status})` : compact;
}

function normalizedProviderError(
  status: number,
  retryable: boolean,
  message: string,
  extra?: Record<string, unknown>,
) {
  const envelope = {
    status,
    provider: "trawex",
    retryable,
    message: safeDiagnostic(message, status),
    ...(extra ?? {}),
  };
  return {
    status,
    ok: false,
    data: {
      // Legacy compatibility: some clients read data.error as a user-facing string.
      error: envelope.message,
      error_envelope: envelope,
    },
  };
}

function retryDelayMs(attempt: number) {
  const exp = Math.min(TRAWEX_RETRY_MAX_MS, TRAWEX_RETRY_BASE_MS * (2 ** attempt));
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exp * 0.25)));
  return Math.min(TRAWEX_RETRY_MAX_MS, exp + jitter);
}

function shouldRetryStatus(status: number) {
  return TRAWEX_RETRYABLE_STATUS.has(status);
}

function isRetryableNetworkError(err: unknown) {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("aborted") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket")
  );
}

async function trawexFetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), TRAWEX_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function trawexCall(path: string, payload: Record<string, unknown>) {
  if (!trawexReady()) {
    return normalizedProviderError(503, false, "provider not configured", {
      attempts: 0,
      needed_env: ["TRAWEX_BASE_URL", "TRAWEX_API_KEY"],
    });
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    [TRAWEX_AUTH_HEADER]: TRAWEX_API_KEY,
  };
  const url = TRAWEX_BASE_URL + path;

  let lastFailure: { status: number; message: string; retryable: boolean; attempts: number } | null = null;

  for (let attempt = 0; attempt <= TRAWEX_MAX_RETRIES; attempt++) {
    try {
      const r = await trawexFetchWithTimeout(url, headers, payload);
      const text = await r.text();
      let data: unknown = text;
      try { data = JSON.parse(text); } catch { /* keep raw */ }

      if (r.ok) {
        return { status: r.status, ok: true, data };
      }

      const retryable = shouldRetryStatus(r.status);
      const message =
        (data && typeof data === "object" && "message" in (data as Record<string, unknown>) &&
          typeof (data as Record<string, unknown>).message === "string")
          ? (data as Record<string, unknown>).message as string
          : "provider request failed";

      if (retryable && attempt < TRAWEX_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
        continue;
      }

      return normalizedProviderError(r.status, retryable, message, {
        attempts: attempt + 1,
      });
    } catch (err) {
      const retryable = isRetryableNetworkError(err);
      const status = 502;
      const message = err instanceof Error ? err.message : "network error";

      if (retryable && attempt < TRAWEX_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
        continue;
      }

      lastFailure = { status, message, retryable, attempts: attempt + 1 };
      break;
    }
  }

  if (lastFailure) {
    return normalizedProviderError(
      lastFailure.status,
      lastFailure.retryable,
      lastFailure.message,
      { attempts: lastFailure.attempts },
    );
  }

  return normalizedProviderError(500, false, "unexpected provider error");
}

export const trawexAdapter: BookingAdapter = {
  name: "trawex",
  async search(product, params) {
    const p = trawexPaths(product);
    return trawexCall(p.search, { product, ...params });
  },
  async create(product, params) {
    const p = trawexPaths(product);
    return trawexCall(p.create, { product, ...params });
  },
  async cancel(product, params) {
    const p = trawexPaths(product);
    return trawexCall(p.cancel, { product, ...params });
  },
  async modify(product, params) {
    const p = trawexPaths(product);
    return trawexCall(p.modify, { product, ...params });
  },
  async get(product, params) {
    const p = trawexPaths(product);
    return trawexCall(p.get, { product, ...params });
  },
};

// Router defaults:
// - Flights keep Duffel fallback for continuity.
// - Hotels/Cars are pinned to Trawex by default.
export function pickAdapter(product: Product, override?: string): BookingAdapter {
  if (override === "trawex") return trawexAdapter;
  if (override === "duffel") return duffelAdapter;
  const defaults: Record<Product, BookingAdapter> = {
    flights: trawexReady() ? trawexAdapter : duffelAdapter,
    hotels:  trawexAdapter,
    cars:    trawexAdapter,
  };
  return defaults[product];
}
