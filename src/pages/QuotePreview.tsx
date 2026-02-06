import { useSearchParams } from "react-router-dom";
import { Plane, Clock, MapPin, Calendar, DollarSign, Shield, Phone, Globe, Mail } from "lucide-react";
import logoImg from "@/assets/logo-dark-blue-badge.png";

export default function QuotePreview() {
  const [searchParams] = useSearchParams();

  // Flight data from URL params or defaults
  const origin = searchParams.get("origin") || "Manila (MNL)";
  const destination = searchParams.get("destination") || "Los Angeles (LAX)";
  const airline = searchParams.get("airline") || "Philippine Airlines";
  const flightNumber = searchParams.get("flight") || "PR 112";
  const aircraft = searchParams.get("aircraft") || "Boeing 777-300";
  const flightType = searchParams.get("type") || "Nonstop";
  const departureDate = searchParams.get("depDate") || "Sunday, March 1";
  const departureTime = searchParams.get("depTime") || "11:10 AM";
  const arrivalDate = searchParams.get("arrDate") || "Sunday, March 1";
  const arrivalTime = searchParams.get("arrTime") || "7:55 AM";
  const duration = searchParams.get("duration") || "12 hours 45 minutes";
  const economyPrice = searchParams.get("economy") || "350";
  const businessPrice = searchParams.get("business") || "1,050";
  const passengerName = searchParams.get("name") || "";
  const quoteDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const quoteRef = searchParams.get("ref") || `YTA-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  return (
    <div className="min-h-screen bg-white print:bg-white" id="quote-page">
      {/* Print button - hidden when printing */}
      <div className="print:hidden fixed top-6 right-6 z-50 flex gap-3">
        <button
          onClick={() => window.print()}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          📄 Save as PDF / Print
        </button>
        <button
          onClick={() => window.history.back()}
          className="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-semibold shadow-lg hover:bg-gray-300 transition-colors"
        >
          ← Back
        </button>
      </div>

      <div className="max-w-[800px] mx-auto bg-white text-gray-900 print:shadow-none shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0a1628] to-[#162544] text-white px-10 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={logoImg} alt="Your Travel Agent" className="w-14 h-14 rounded-lg" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Your Travel Agent
                </h1>
                <p className="text-blue-300 text-sm font-medium">Premium Flight Deals • Save 50%+</p>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className="text-blue-200">Quote Reference</p>
              <p className="text-xl font-bold font-mono tracking-wider">{quoteRef}</p>
              <p className="text-blue-300 mt-1">{quoteDate}</p>
            </div>
          </div>
        </div>

        {/* Blue accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500" />

        {/* Recipient */}
        {passengerName && (
          <div className="px-10 pt-6 pb-2">
            <p className="text-gray-500 text-sm">Prepared for</p>
            <p className="text-xl font-semibold text-gray-900">{passengerName}</p>
          </div>
        )}

        {/* Route Hero */}
        <div className="px-10 py-8">
          <div className="bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-100 rounded-2xl p-8">
            <div className="flex items-center justify-between">
              {/* Origin */}
              <div className="text-center flex-1">
                <p className="text-4xl font-extrabold text-gray-900" style={{ fontFamily: "'Syne', sans-serif" }}>
                  {origin.match(/\(([^)]+)\)/)?.[1] || origin}
                </p>
                <p className="text-gray-600 mt-1 text-sm font-medium">{origin.replace(/\s*\([^)]+\)/, "")}</p>
              </div>

              {/* Flight path */}
              <div className="flex-1 flex flex-col items-center px-4">
                <p className="text-sm font-semibold text-blue-600 mb-2">{flightType}</p>
                <div className="relative w-full flex items-center justify-center">
                  <div className="w-full h-[2px] bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200" />
                  <Plane className="absolute w-6 h-6 text-blue-600 bg-blue-50 rounded-full p-0.5" />
                </div>
                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {duration}
                </p>
              </div>

              {/* Destination */}
              <div className="text-center flex-1">
                <p className="text-4xl font-extrabold text-gray-900" style={{ fontFamily: "'Syne', sans-serif" }}>
                  {destination.match(/\(([^)]+)\)/)?.[1] || destination}
                </p>
                <p className="text-gray-600 mt-1 text-sm font-medium">{destination.replace(/\s*\([^)]+\)/, "")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Flight Details Grid */}
        <div className="px-10 pb-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Departure */}
            <div className="border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-lg">🛫</span>
                </div>
                <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">Departure</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">City</span>
                  <span className="font-semibold text-gray-900">{origin}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date</span>
                  <span className="font-semibold text-gray-900">{departureDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Time</span>
                  <span className="font-semibold text-gray-900">{departureTime}</span>
                </div>
              </div>
            </div>

            {/* Arrival */}
            <div className="border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-lg">🛬</span>
                </div>
                <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">Arrival</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">City</span>
                  <span className="font-semibold text-gray-900">{destination}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date</span>
                  <span className="font-semibold text-gray-900">{arrivalDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Time</span>
                  <span className="font-semibold text-gray-900">{arrivalTime}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Flight Info Bar */}
        <div className="px-10 pb-6">
          <div className="bg-slate-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Airline:</span>
              <span className="font-bold text-gray-900">{airline}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Flight:</span>
              <span className="font-bold text-gray-900">{flightNumber}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Aircraft:</span>
              <span className="font-bold text-gray-900">{aircraft}</span>
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        <div className="px-10 pb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            Price Quote (Per Passenger)
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Economy */}
            <div className="relative overflow-hidden border-2 border-blue-200 rounded-2xl p-6 bg-gradient-to-br from-white to-blue-50">
              <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                Best Value
              </div>
              <p className="text-sm font-semibold text-blue-600 uppercase tracking-wider">Economy Class</p>
              <p className="text-4xl font-extrabold text-gray-900 mt-2" style={{ fontFamily: "'Syne', sans-serif" }}>
                ${economyPrice}
              </p>
              <p className="text-xs text-gray-500 mt-1">USD per passenger</p>
            </div>

            {/* Business */}
            <div className="relative overflow-hidden border-2 border-amber-200 rounded-2xl p-6 bg-gradient-to-br from-white to-amber-50">
              <div className="absolute top-0 right-0 bg-amber-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                Premium
              </div>
              <p className="text-sm font-semibold text-amber-600 uppercase tracking-wider">Business Class</p>
              <p className="text-4xl font-extrabold text-gray-900 mt-2" style={{ fontFamily: "'Syne', sans-serif" }}>
                ${businessPrice}
              </p>
              <p className="text-xs text-gray-500 mt-1">USD per passenger</p>
            </div>
          </div>
        </div>

        {/* Trust / Guarantee Section */}
        <div className="px-10 pb-8">
          <div className="bg-green-50 border border-green-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <Shield className="w-6 h-6 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-green-800 text-sm">Our Guarantee</h3>
                <ul className="text-sm text-green-700 mt-2 space-y-1">
                  <li>✓ Lowest price guaranteed — save 50%+ off retail</li>
                  <li>✓ Confirmed e-ticket sent within 24–48 hours</li>
                  <li>✓ Full refund if we can't fulfill your booking</li>
                  <li>✓ 24/7 support via chat, WhatsApp, or phone</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Validity Notice */}
        <div className="px-10 pb-6">
          <p className="text-xs text-gray-400 italic text-center">
            This quote is valid for 48 hours from the date of issue. Prices are subject to availability and may change.
            Seats are not held until booking is confirmed with payment.
          </p>
        </div>

        {/* Footer */}
        <div className="bg-gradient-to-r from-[#0a1628] to-[#162544] text-white px-10 py-6">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-300" />
                <span>your-travel-agent.net</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-300" />
                <span>deals@your-travel-agent.net</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-blue-300" />
              <span>Chat with Maya 24/7</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/10 text-center text-xs text-blue-300">
            © {new Date().getFullYear()} Your Travel Agent — Premium Flight Deals at Unbeatable Prices
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #quote-page {
            width: 100%;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
