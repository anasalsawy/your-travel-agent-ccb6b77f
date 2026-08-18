// Booking-call brief → populated agent mission script (ported from the CrewAI
// "AI Travel Booking Caller" crew: script generator + Twilio call orchestrator).

export type BookingBrief = {
  agency: string;
  travelers: string;
  trip: string;
  cabin: string;
  special: string;
  handoffPhone: string;
};

export const AGENCY_DIRECTORY: Record<string, string> = {
  "American Airlines": "+18004337300",
  "Alaska Airlines": "+18002527522",
  "Expedia": "+18443163592",
  "Priceline": "+18887748678",
  "Delta Air Lines": "+18002211212",
  "United Airlines": "+18005647330",
  "Southwest Airlines": "+18004359792",
  "Air France": "+18002378723",
  "British Airways": "+18002478297",
  "Emirates": "+18002364000",
  "Booking.com": "+18882346298",
  "Hotels.com": "+18004468888",
};

export const IVR_PLANS: Record<string, string[]> = {
  "American Airlines": ["Wait for greeting", "Press 1 — reservations", "Press 1 — new booking", "Press 0 if looped 3×"],
  "Alaska Airlines": ["Wait for greeting", "Press 2 — reservations", "Press 1 — new reservation", "Press 0 if looped 3×"],
  "Delta Air Lines": ["Wait for greeting", "Press 1 — reservations", "Press 2 — new flight", "Press 0 if looped 3×"],
  "United Airlines": ["Wait for greeting", "Press 1 — reservations", "Press 1 — new booking", "Press 0 if looped 3×"],
  default: ["Wait for greeting", "Press 1 — new reservation", "Say 'agent' twice", "Press 0 if looped 3×"],
};

export const CALL_STATES = [
  "PRECALL_VALIDATED",
  "DIALING",
  "IVR",
  "HUMAN_CONNECTED",
  "SEARCHING",
  "TRAVELER_DECISION",
  "SECURE_PAYMENT",
  "COMPLETE",
] as const;

export function ivrPlanFor(agency: string) {
  return IVR_PLANS[agency] ?? IVR_PLANS.default;
}

export function buildCallScript(b: BookingBrief) {
  return `AUTHORIZED OUTBOUND FLIGHT-BOOKING AGENT

ROLE
You are calling ${b.agency} on behalf of ${b.travelers || "the traveler"}, strictly within their documented authorization, to research, compare, hold, reserve and confirm flights.

IDENTITY DISCLOSURE (first human contact, verbatim)
"Hello, I'm an AI assistant calling on behalf of ${b.travelers || "the traveler"} with their authorization about a flight reservation. Trip details: ${b.trip}. Can your team work with an authorized AI assistant, or do you need the traveler to join?"

RUNTIME INPUTS
Called party: ${b.agency}
Travelers: ${b.travelers}
Trip: ${b.trip}
Cabin: ${b.cabin}
Special requirements: ${b.special || "none"}
Traveler handoff phone: ${b.handoffPhone || "not provided"}

IVR NAVIGATION PLAN
${ivrPlanFor(b.agency).map((s, i) => `${i + 1}. ${s}`).join("\n")}

TRANSACTION STATES (never conflate)
${CALL_STATES.join(" → ")}

PAYMENT SAFETY
Never speak, request, repeat or accept payment card data. At SECURE_PAYMENT stop all AI speech and hand off to the traveler at ${b.handoffPhone || "the traveler's number"}.

COMPLETION
Report the final state as QUOTE / HELD / PNR_UNPAID / TICKETED / UNKNOWN with record locator, fare, taxes, baggage and any remaining actions.`;
}
