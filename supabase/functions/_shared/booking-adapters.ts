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

export const duffelAdapter: BookingAdapter = {
  name: "duffel",
  async search(product, params) {
    if (product === "flights") return callInternal("duffel-search", params);
    if (product === "hotels")  return callInternal("duffel-stays-search", params);
    if (product === "cars")    return callInternal("duffel-cars-search", params);
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
