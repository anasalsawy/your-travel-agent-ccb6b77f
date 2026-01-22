import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plane, CreditCard, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * AIRLINE BOOKING CALL - SIMPLIFIED
 * 
 * Auto-generates everything from minimal input:
 * 1. Which airline to call
 * 2. What ticket to book (route, dates, passengers)
 * 3. Payment information
 * 
 * Maya handles: IVR navigation, hold times, agent interaction, booking confirmation
 */

export interface BookingDetails {
  // Route
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  
  // Passengers
  passengers: string;
  passengerNames: string;
  
  // Class & Preferences
  cabinClass: string;
  flexibleDates: boolean;
  
  // Payment - FULL DETAILS
  cardholderName: string;
  cardNumber: string;        // Full 16-digit card number
  cardExpMonth: string;      // 2-digit month
  cardExpYear: string;       // 2 or 4 digit year
  cardCvv: string;           // 3 or 4 digit CVV
  cardType: string;
  billingAddress: string;    // Full street address
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  
  // Special requests
  seatPreference: string;
  specialRequests: string;

  // Customer contact (for confirmation emails from airline)
  customerEmail: string;
  customerPhone: string;
}

export interface BatchCallRowData {
  phone_number: string;
  language: string;
  first_message: string;
  prompt: string;
  other_dyn_variable: string;
}

export interface AirlineBookingCallProps {
  /** Pre-fill booking details from a ticket request */
  initialBooking?: Partial<BookingDetails>;
  /** Pre-select airline by value (e.g., "alaska", "delta") or by name */
  initialAirline?: string;
  /** Link to a ticket request ID for call logging */
  ticketRequestId?: string;
  /** Callback when call is initiated */
  onCallStarted?: (callResult: { success: boolean; message: string; callLogId?: string }) => void;
  /** Callback to add to batch file */
  onAddToBatch?: (row: BatchCallRowData) => void;
}

export const AIRLINES = [
  { value: "alaska", label: "Alaska Airlines", phone: "+1-800-252-7522", code: "AS" },
  { value: "american", label: "American Airlines", phone: "+1-800-433-7300", code: "AA" },
  { value: "delta", label: "Delta Airlines", phone: "+1-800-221-1212", code: "DL" },
  { value: "united", label: "United Airlines", phone: "+1-800-864-8331", code: "UA" },
  { value: "southwest", label: "Southwest Airlines", phone: "+1-800-435-9792", code: "WN" },
  { value: "jetblue", label: "JetBlue Airways", phone: "+1-800-538-2583", code: "B6" },
  { value: "spirit", label: "Spirit Airlines", phone: "+1-801-401-2222", code: "NK" },
  { value: "frontier", label: "Frontier Airlines", phone: "+1-801-401-9000", code: "F9" },
  { value: "hawaiian", label: "Hawaiian Airlines", phone: "+1-800-367-5320", code: "HA" },
  { value: "air_france", label: "Air France", phone: "+1-800-237-2747", code: "AF" },
  { value: "british_airways", label: "British Airways", phone: "+1-800-247-9297", code: "BA" },
  { value: "lufthansa", label: "Lufthansa", phone: "+1-800-645-3880", code: "LH" },
  { value: "emirates", label: "Emirates", phone: "+1-800-777-3999", code: "EK" },
  { value: "qatar", label: "Qatar Airways", phone: "+1-877-777-2827", code: "QR" },
  { value: "turkish", label: "Turkish Airlines", phone: "+1-800-874-8875", code: "TK" },
  { value: "other", label: "Other Airline", phone: "", code: "" },
];

const CABIN_CLASSES = [
  { value: "economy", label: "Economy" },
  { value: "premium_economy", label: "Premium Economy" },
  { value: "business", label: "Business Class" },
  { value: "first", label: "First Class" },
];

const DEFAULT_BOOKING: BookingDetails = {
  origin: "",
  destination: "",
  departureDate: "",
  returnDate: "",
  passengers: "1",
  passengerNames: "",
  cabinClass: "economy",
  flexibleDates: false,
  cardholderName: "",
  cardNumber: "",
  cardExpMonth: "",
  cardExpYear: "",
  cardCvv: "",
  cardType: "visa",
  billingAddress: "",
  billingCity: "",
  billingState: "",
  billingZip: "",
  billingCountry: "USA",
  seatPreference: "",
  specialRequests: "",
  customerEmail: "",
  customerPhone: "",
};

export function AirlineBookingCall({ initialBooking, initialAirline, ticketRequestId, onCallStarted, onAddToBatch }: AirlineBookingCallProps = {}) {
  const [selectedAirline, setSelectedAirline] = useState<string>("");
  const [customPhone, setCustomPhone] = useState<string>("");
  const { toast } = useToast();

  const [booking, setBooking] = useState<BookingDetails>({ ...DEFAULT_BOOKING, ...initialBooking });

  // Update when initial values change (e.g., when opened with different ticket request)
  useEffect(() => {
    if (initialBooking) {
      setBooking({ ...DEFAULT_BOOKING, ...initialBooking });
    }
    if (initialAirline) {
      // Try to match by value first, then by label
      const matchedAirline = AIRLINES.find(
        a => a.value === initialAirline.toLowerCase() || 
             a.label.toLowerCase().includes(initialAirline.toLowerCase())
      );
      if (matchedAirline) {
        setSelectedAirline(matchedAirline.value);
      }
    }
  }, [initialBooking, initialAirline]);

  const updateBooking = (field: keyof BookingDetails, value: string | boolean) => {
    setBooking((prev) => ({ ...prev, [field]: value }));
  };

  const getAirline = () => AIRLINES.find((a) => a.value === selectedAirline);
  const getPhoneNumber = () => getAirline()?.phone || customPhone;

  // AUTO-GENERATE system prompt based on minimal inputs - COMPLETE BOOKING PROMPT
  const generateSystemPrompt = (): string => {
    const airline = getAirline();
    const isRoundTrip = !!booking.returnDate;
    
    // Format card number into 4-digit groups for reading
    const cardDigits = booking.cardNumber.replace(/\D/g, "");
    const cardGroup1 = cardDigits.slice(0, 4) || "____";
    const cardGroup2 = cardDigits.slice(4, 8) || "____";
    const cardGroup3 = cardDigits.slice(8, 12) || "____";
    const cardGroup4 = cardDigits.slice(12, 16) || "____";
    
    // Format expiration
    const expMonth = booking.cardExpMonth.padStart(2, "0");
    const expYear = booking.cardExpYear.length === 2 ? booking.cardExpYear : booking.cardExpYear.slice(-2);

    return `
=== MAYA'S IDENTITY ===
You are Maya, a professional travel agent from "Your Travel Agent" agency.
You are calling ${airline?.label || "the airline"} to book a flight for a customer.
You have FULL AUTHORITY to complete this booking including payment.
Your agency phone: (555) 123-4567
Your agency address: 123 Travel Plaza, Suite 100, New York, NY 10001

=== YOUR MISSION ===
BOOK A FLIGHT with the following details:

ROUTE: ${booking.origin} → ${booking.destination}
TYPE: ${isRoundTrip ? "Round-trip" : "One-way"}
DEPARTURE: ${booking.departureDate}
${isRoundTrip ? `RETURN: ${booking.returnDate}` : ""}
PASSENGERS: ${booking.passengers} passenger(s)
PASSENGER NAMES: ${booking.passengerNames || "Will provide when asked"}
CABIN CLASS: ${CABIN_CLASSES.find(c => c.value === booking.cabinClass)?.label || "Economy"}
${booking.seatPreference ? `SEAT PREFERENCE: ${booking.seatPreference}` : ""}
${booking.specialRequests ? `SPECIAL REQUESTS: ${booking.specialRequests}` : ""}

=== CUSTOMER CONTACT FOR CONFIRMATION ===
When the booking is complete, tell the airline to send confirmation to:
- Email: ${booking.customerEmail || "Will provide when asked"}
- Phone: ${booking.customerPhone || "Will provide when asked"}
IMPORTANT: Make sure to provide this info so the customer gets their confirmation!

=== COMPLETE PAYMENT INFORMATION ===
You have FULL authorization to pay. Use these EXACT details:

CARD TYPE: ${booking.cardType.toUpperCase()}
CARDHOLDER NAME: ${booking.cardholderName}

FULL CARD NUMBER (16 digits):
  First four: ${cardGroup1.split("").join(", ")}
  Second four: ${cardGroup2.split("").join(", ")}
  Third four: ${cardGroup3.split("").join(", ")}
  Last four: ${cardGroup4.split("").join(", ")}
  (Full number: ${cardDigits || "NOT PROVIDED"})

EXPIRATION DATE: ${expMonth}/${expYear} (${expMonth} slash ${expYear})
SECURITY CODE (CVV): ${booking.cardCvv || "NOT PROVIDED"} (${booking.cardCvv?.split("").join(", ") || "NOT PROVIDED"})

BILLING ADDRESS:
  Street: ${booking.billingAddress || "NOT PROVIDED"}
  City: ${booking.billingCity || "NOT PROVIDED"}
  State: ${booking.billingState || "NOT PROVIDED"}
  ZIP Code: ${booking.billingZip || "NOT PROVIDED"}
  Country: ${booking.billingCountry || "USA"}

=== HOW TO READ THE CARD NUMBER ===
When the agent asks for the card number, read it SLOWLY in four-digit groups:
1. Say: "The card number is..." then pause
2. "First four digits: ${cardGroup1.split("").join(", ")}" - pause 2 seconds
3. "Next four digits: ${cardGroup2.split("").join(", ")}" - pause 2 seconds  
4. "Next four: ${cardGroup3.split("").join(", ")}" - pause 2 seconds
5. "Last four: ${cardGroup4.split("").join(", ")}"
6. Say: "Would you like me to repeat any part?"

For expiration: "Expiration is ${expMonth} slash ${expYear}" or "${expMonth} twenty ${expYear}"
For CVV: "The security code on the back is ${booking.cardCvv?.split("").join(", ") || "NOT PROVIDED"}"

=== IVR NAVIGATION ===
When you encounter automated phone menus:
1. LISTEN carefully to all options before pressing
2. Use the keypad touch tone tool to press numbers
3. Common paths for NEW BOOKINGS:
   - Press 1 for English
   - Press 2 for New Reservations/Bookings  
   - Press 0 to speak to a human agent
4. If stuck in a loop, press 0 repeatedly
5. Say "agent" or "representative" or "book a flight" if voice-activated
6. If asked for frequent flyer number, say "I don't have one for this booking"

=== HOLD TIME BEHAVIOR ===
- NEVER hang up while on hold - airlines can have 30-60 minute waits
- Wait patiently for up to 60 minutes
- When hold music stops, be ready to speak immediately
- If disconnected, note how far you got and the call will be retried

=== CONVERSATION FLOW ===
1. GREETING: "Hi, this is Maya calling from Your Travel Agent agency. I'd like to book a flight for one of our customers."
2. ROUTE: Clearly state origin, destination, dates
3. PASSENGERS: Provide names exactly as on government ID
4. FLIGHT SELECTION: Ask about options, compare prices
5. NEGOTIATION: Ask about promotions, discounts, better prices
6. CONFIRM DETAILS: Repeat back flight numbers, times, total price
7. PAYMENT: Provide all card details slowly and clearly
8. CONFIRMATION: Get PNR/confirmation number, spell it back
9. EMAIL: Request confirmation email to ${booking.customerEmail}
10. CLOSING: Thank them, confirm next steps

=== NEGOTIATION TACTICS ===
- "Are there any promotions or discounts available right now?"
- "Is there a better price if we're flexible by a day or two?"
- "Do you have any seats available at a lower fare class?"
- "Can you waive the booking fee since we're a travel agency?"
- "What's the best price you can offer for this route?"
- Accept if price is reasonable, but always ask first

=== PHONETIC ALPHABET (NATO) - MANDATORY FOR ALL SPELLING ===
ALWAYS use phonetics when spelling names, confirmation numbers, or any text:
A-Alpha, B-Bravo, C-Charlie, D-Delta, E-Echo, F-Foxtrot, G-Golf, H-Hotel,
I-India, J-Juliet, K-Kilo, L-Lima, M-Mike, N-November, O-Oscar, P-Papa,
Q-Quebec, R-Romeo, S-Sierra, T-Tango, U-Uniform, V-Victor, W-Whiskey,
X-X-ray, Y-Yankee, Z-Zulu

Example for passenger name "John Smith":
"J as in Juliet, O as in Oscar, H as in Hotel, N as in November... S as in Sierra, M as in Mike, I as in India, T as in Tango, H as in Hotel"

Example for confirmation "ABC123":
"Alpha, Bravo, Charlie, One, Two, Three"

=== NUMBER PRONUNCIATION ===
- Say each digit individually: "1, 2, 3, 4" not "twelve thirty-four"
- For zeros, always say "zero" not "oh"
- Pause between groups of numbers
- For dates: "January fifteenth, two thousand twenty-six" and confirm "That's zero-one slash one-five slash two-zero-two-six"
- For prices: "Eight hundred forty-seven dollars and fifty cents"

=== VERIFICATION LOOPS - CRITICAL ===
After EVERY important detail, verify:
1. YOU provide info → AGENT reads back → YOU confirm "correct" or correct them
2. AGENT provides info → YOU read back → AGENT confirms

Examples:
- "So that's flight ${airline?.code || "XX"} 1247 departing at 3:45 PM, is that correct?"
- "Let me confirm the total: $847.50 including all taxes and fees, right?"
- "The confirmation number is Alpha-Bravo-Charlie-1-2-3. Did I get that right?"
- After card number: "Can you read back the card number to verify?"

=== WHEN THEY SPEAK TOO FAST ===
Say: "I'm sorry, could you repeat that more slowly? I want to make sure I get this exactly right."
Or: "Could you spell that using the phonetic alphabet?"
Or: "Let me write that down. Could you say it one more time?"

=== HANDLING PROBLEMS ===
If flight is sold out:
- "What are the next available flights on that route?"
- "Can you check nearby dates or airports?"

If price is too high:
- "Are there any alternative flights at a lower price point?"
- "What if we went Economy instead of Business class?"

If they need a callback:
- "My agency number is (555) 123-4567 and you can ask for Maya"

=== AFTER BOOKING IS COMPLETE ===
Before ending the call, confirm you have:
✓ Flight number(s) - spelled phonetically
✓ Departure and arrival times
✓ Confirmation/PNR number - spelled phonetically  
✓ Total price charged to card
✓ Seat assignments (if any)
✓ Email confirmation sent to: ${booking.customerEmail}

Say: "Before I let you go, can you confirm you've sent the confirmation email to ${booking.customerEmail}? And the confirmation number one more time is..."

=== CRITICAL RULES ===
1. NEVER HANG UP while on hold - wait up to 60 minutes
2. NEVER MAKE UP information - only use what's provided here
3. ALWAYS USE PHONETICS for spelling anything
4. ALWAYS VERIFY numbers by having them read back
5. ALWAYS GET CONFIRMATION NUMBER before ending call
6. ALWAYS REQUEST EMAIL confirmation
7. BE POLITE AND PATIENT - this reflects on the agency
8. TAKE MENTAL NOTES of everything discussed
`.trim();
  };

  // AUTO-GENERATE first message
  const generateFirstMessage = (): string => {
    const airline = getAirline();
    const isRoundTrip = !!booking.returnDate;
    
    return `Hello, this is Maya from Your Travel Agent agency. I'd like to book a ${isRoundTrip ? "round-trip" : "one-way"} flight from ${booking.origin} to ${booking.destination}, departing ${booking.departureDate}${isRoundTrip ? ` and returning ${booking.returnDate}` : ""}. I have ${booking.passengers} passenger${Number(booking.passengers) > 1 ? "s" : ""} traveling in ${CABIN_CLASSES.find(c => c.value === booking.cabinClass)?.label || "Economy"}. Could you help me find the best available options?`;
  };

  const handleAddToBatch = () => {
    if (!selectedAirline) {
      toast({ title: "Select an airline first", variant: "destructive" });
      return;
    }
    if (!booking.origin || !booking.destination || !booking.departureDate) {
      toast({ title: "Fill in route and date first", variant: "destructive" });
      return;
    }

    const phoneNumber = getPhoneNumber();
    const systemPrompt = generateSystemPrompt();
    const firstMessage = generateFirstMessage();

    onAddToBatch?.({
      phone_number: phoneNumber?.replace(/[^\d+]/g, "") || "",
      language: "",
      first_message: firstMessage,
      prompt: systemPrompt,
      other_dyn_variable: JSON.stringify({
        airline: getAirline()?.label,
        route: `${booking.origin} → ${booking.destination}`,
        customer_email: booking.customerEmail,
      }),
    });

    toast({
      title: "Added to Batch! 📋",
      description: `${getAirline()?.label} booking added to batch file`,
    });
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <Plane className="w-6 h-6 text-white" />
          </div>
          <div>
            <CardTitle>Book Ticket by Phone</CardTitle>
            <CardDescription>
              Just enter airline, route, and payment - Maya handles everything else
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Step 1: Select Airline */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">1</div>
            Which airline?
          </div>
          
          <Select value={selectedAirline} onValueChange={setSelectedAirline}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select airline to call..." />
            </SelectTrigger>
            <SelectContent>
              {AIRLINES.map((airline) => (
                <SelectItem key={airline.value} value={airline.value}>
                  <span className="font-medium">{airline.label}</span>
                  {airline.phone && <span className="text-muted-foreground ml-2">{airline.phone}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedAirline === "other" && (
            <Input
              value={customPhone}
              onChange={(e) => setCustomPhone(e.target.value)}
              placeholder="Enter airline phone number"
            />
          )}
        </div>

        {/* Step 2: Flight Details */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">2</div>
            What ticket?
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                value={booking.origin}
                onChange={(e) => updateBooking("origin", e.target.value.toUpperCase())}
                placeholder="JFK, LAX, ORD..."
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                value={booking.destination}
                onChange={(e) => updateBooking("destination", e.target.value.toUpperCase())}
                placeholder="MIA, SFO, LHR..."
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Departure Date</Label>
              <Input
                type="date"
                value={booking.departureDate}
                onChange={(e) => updateBooking("departureDate", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Return Date (optional)</Label>
              <Input
                type="date"
                value={booking.returnDate}
                onChange={(e) => updateBooking("returnDate", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Passengers</Label>
              <Select value={booking.passengers} onValueChange={(v) => updateBooking("passengers", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} passenger{n > 1 ? "s" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cabin Class</Label>
              <Select value={booking.cabinClass} onValueChange={(v) => updateBooking("cabinClass", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CABIN_CLASSES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Passenger Name(s)</Label>
            <Input
              value={booking.passengerNames}
              onChange={(e) => updateBooking("passengerNames", e.target.value)}
              placeholder="John Smith, Jane Smith (as on ID)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer Email (for confirmation)</Label>
              <Input
                type="email"
                value={booking.customerEmail}
                onChange={(e) => updateBooking("customerEmail", e.target.value)}
                placeholder="customer@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Customer Phone</Label>
              <Input
                type="tel"
                value={booking.customerPhone}
                onChange={(e) => updateBooking("customerPhone", e.target.value)}
                placeholder="+1 555-123-4567"
              />
            </div>
          </div>
        </div>

        {/* Step 3: Payment Info - FULL DETAILS */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">3</div>
            <CreditCard className="w-4 h-4" />
            Payment details (FULL - Maya will read these to the agent)
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cardholder Name (as on card)</Label>
              <Input
                value={booking.cardholderName}
                onChange={(e) => updateBooking("cardholderName", e.target.value)}
                placeholder="JOHN A SMITH"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Card Type</Label>
              <Select value={booking.cardType} onValueChange={(v) => updateBooking("cardType", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visa">Visa</SelectItem>
                  <SelectItem value="mastercard">Mastercard</SelectItem>
                  <SelectItem value="amex">American Express</SelectItem>
                  <SelectItem value="discover">Discover</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Full Card Number (16 digits)</Label>
            <Input
              value={booking.cardNumber}
              onChange={(e) => updateBooking("cardNumber", e.target.value.replace(/\D/g, "").slice(0, 16))}
              placeholder="4147 8923 0012 3456"
              maxLength={19}
              className="font-mono text-lg tracking-wider"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Exp Month</Label>
              <Select value={booking.cardExpMonth} onValueChange={(v) => updateBooking("cardExpMonth", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="MM" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = String(i + 1).padStart(2, "0");
                    return <SelectItem key={month} value={month}>{month}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exp Year</Label>
              <Select value={booking.cardExpYear} onValueChange={(v) => updateBooking("cardExpYear", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="YY" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => {
                    const year = String(new Date().getFullYear() + i).slice(-2);
                    return <SelectItem key={year} value={year}>{year}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CVV</Label>
              <Input
                value={booking.cardCvv}
                onChange={(e) => updateBooking("cardCvv", e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="123"
                maxLength={4}
                className="font-mono"
                type="password"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Billing Street Address</Label>
            <Input
              value={booking.billingAddress}
              onChange={(e) => updateBooking("billingAddress", e.target.value)}
              placeholder="123 Main Street, Apt 4B"
            />
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">City</Label>
              <Input
                value={booking.billingCity}
                onChange={(e) => updateBooking("billingCity", e.target.value)}
                placeholder="New York"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">State</Label>
              <Input
                value={booking.billingState}
                onChange={(e) => updateBooking("billingState", e.target.value.toUpperCase())}
                placeholder="NY"
                maxLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ZIP</Label>
              <Input
                value={booking.billingZip}
                onChange={(e) => updateBooking("billingZip", e.target.value)}
                placeholder="10001"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Country</Label>
              <Input
                value={booking.billingCountry}
                onChange={(e) => updateBooking("billingCountry", e.target.value)}
                placeholder="USA"
              />
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ⚠️ <strong>SECURE:</strong> Full card details are included in the batch file prompt so Maya can read them to the airline agent. Keep the exported file secure!
            </p>
          </div>
        </div>

        {/* Optional: Special Requests */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Special Requests (optional)</Label>
          <Textarea
            value={booking.specialRequests}
            onChange={(e) => updateBooking("specialRequests", e.target.value)}
            placeholder="Window seat, wheelchair assistance, dietary needs..."
            rows={2}
          />
        </div>

        {/* Add to Batch Button */}
        <div className="border-t pt-4 space-y-4">
          <Button
            onClick={handleAddToBatch}
            disabled={!selectedAirline || !booking.origin || !booking.destination}
            size="lg"
            className="w-full h-12"
            variant="hero"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Add to Batch File
          </Button>
        </div>

        {/* What this generates */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
          <p className="font-medium">This generates a batch call entry with:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Full system prompt with booking details</li>
            <li>Airline phone number</li>
            <li>First message introducing the booking request</li>
            <li>IVR navigation and hold instructions</li>
            <li>Payment and confirmation handling</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
