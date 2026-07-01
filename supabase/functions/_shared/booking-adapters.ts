// Provider-agnostic booking adapters.
// Today: Duffel (Flights live; Cars/Stays gated on live acct).
// Tomorrow: Trawex — slot in the same interface, agents/tools don't change.

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
    if (product === "flights") return callInternal("duffel-book", params);
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

export const trawexAdapter: BookingAdapter = {
  name: "trawex",
  async search() { return { status: 503, ok: false, data: { error: "trawex adapter pending H2H creds from Manoj" } }; },
  async create() { return { status: 503, ok: false, data: { error: "trawex adapter pending H2H creds" } }; },
  async cancel() { return { status: 503, ok: false, data: { error: "trawex adapter pending H2H creds" } }; },
  async modify() { return { status: 503, ok: false, data: { error: "trawex adapter pending H2H creds" } }; },
  async get()    { return { status: 503, ok: false, data: { error: "trawex adapter pending H2H creds" } }; },
};

// Router: today defaults to Duffel; will switch to Trawex per-product once ready.
export function pickAdapter(product: Product, override?: string): BookingAdapter {
  if (override === "trawex") return trawexAdapter;
  if (override === "duffel") return duffelAdapter;
  // Default matrix — flip these when Trawex is live
  const defaults: Record<Product, BookingAdapter> = {
    flights: duffelAdapter,
    hotels:  duffelAdapter,
    cars:    duffelAdapter,
  };
  return defaults[product];
}
