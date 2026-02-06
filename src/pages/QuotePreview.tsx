import { useSearchParams } from "react-router-dom";
import logoImg from "@/assets/logo-dark-blue-badge.png";

export default function QuotePreview() {
  const [searchParams] = useSearchParams();

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
  const quoteRef = searchParams.get("ref") || `YTA-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const quoteDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const originCode = origin.match(/\(([^)]+)\)/)?.[1] || origin;
  const destCode = destination.match(/\(([^)]+)\)/)?.[1] || destination;
  const originCity = origin.replace(/\s*\([^)]+\)/, "");
  const destCity = destination.replace(/\s*\([^)]+\)/, "");

  return (
    <div className="min-h-screen bg-[#f5f5f5] print:bg-white" id="quote-page">
      {/* Print button */}
      <div className="print:hidden fixed top-6 right-6 z-50 flex gap-3">
        <button
          onClick={() => window.print()}
          className="bg-[#1a2332] text-white px-6 py-3 rounded font-medium shadow-lg hover:bg-[#2a3a4e] transition-colors text-sm tracking-wide"
        >
          ↓ SAVE AS PDF
        </button>
        <button
          onClick={() => window.history.back()}
          className="bg-white text-[#1a2332] px-6 py-3 rounded font-medium shadow-lg hover:bg-gray-100 transition-colors text-sm border border-gray-300"
        >
          ← BACK
        </button>
      </div>

      <div className="max-w-[780px] mx-auto bg-white print:shadow-none shadow-xl my-8 print:my-0">

        {/* Header */}
        <div className="px-12 pt-10 pb-8 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <img src={logoImg} alt="Your Travel Agent" className="w-12 h-12" />
              <div>
                <h1 className="text-xl font-semibold text-[#1a2332] tracking-tight">
                  Your Travel Agent
                </h1>
                <p className="text-[11px] text-gray-400 tracking-widest uppercase mt-0.5">
                  Flight Quote
                </p>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className="text-[11px] text-gray-400 tracking-widest uppercase">Reference</p>
              <p className="font-mono font-semibold text-[#1a2332] mt-0.5">{quoteRef}</p>
              <p className="text-gray-400 text-xs mt-1">{quoteDate}</p>
            </div>
          </div>

          {passengerName && (
            <div className="mt-6 pt-4 border-t border-gray-100">
              <p className="text-[11px] text-gray-400 tracking-widest uppercase">Prepared For</p>
              <p className="text-[#1a2332] font-medium mt-0.5">{passengerName}</p>
            </div>
          )}
        </div>

        {/* Route */}
        <div className="px-12 py-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-5xl font-bold text-[#1a2332] tracking-tight">{originCode}</p>
              <p className="text-sm text-gray-500 mt-1">{originCity}</p>
            </div>
            <div className="flex-1 mx-8">
              <div className="flex items-center justify-center">
                <div className="h-px flex-1 bg-gray-300" />
                <div className="px-4 text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{flightType}</p>
                  <p className="text-xs text-gray-400 mt-1">{duration}</p>
                </div>
                <div className="h-px flex-1 bg-gray-300" />
              </div>
            </div>
            <div className="text-right">
              <p className="text-5xl font-bold text-[#1a2332] tracking-tight">{destCode}</p>
              <p className="text-sm text-gray-500 mt-1">{destCity}</p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-12 h-px bg-gray-200" />

        {/* Flight Details */}
        <div className="px-12 py-8">
          <p className="text-[11px] text-gray-400 tracking-widest uppercase mb-5">Flight Details</p>

          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-3 text-gray-500 w-40">Airline</td>
                <td className="py-3 text-[#1a2332] font-medium">{airline}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 text-gray-500">Flight</td>
                <td className="py-3 text-[#1a2332] font-medium">{flightNumber}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 text-gray-500">Aircraft</td>
                <td className="py-3 text-[#1a2332] font-medium">{aircraft}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 text-gray-500">Departure</td>
                <td className="py-3 text-[#1a2332] font-medium">{departureDate} at {departureTime}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 text-gray-500">Arrival</td>
                <td className="py-3 text-[#1a2332] font-medium">{arrivalDate} at {arrivalTime}</td>
              </tr>
              <tr>
                <td className="py-3 text-gray-500">Duration</td>
                <td className="py-3 text-[#1a2332] font-medium">{duration} · Direct Flight</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Divider */}
        <div className="mx-12 h-px bg-gray-200" />

        {/* Pricing */}
        <div className="px-12 py-8">
          <p className="text-[11px] text-gray-400 tracking-widest uppercase mb-5">Pricing (Per Passenger)</p>

          <div className="grid grid-cols-2 gap-6">
            <div className="border border-gray-200 rounded-lg p-6">
              <p className="text-[11px] text-gray-400 tracking-widest uppercase">Economy Class</p>
              <p className="text-3xl font-bold text-[#1a2332] mt-2">${economyPrice}</p>
              <p className="text-xs text-gray-400 mt-1">USD per passenger</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-6">
              <p className="text-[11px] text-gray-400 tracking-widest uppercase">Business Class</p>
              <p className="text-3xl font-bold text-[#1a2332] mt-2">${businessPrice}</p>
              <p className="text-xs text-gray-400 mt-1">USD per passenger</p>
            </div>
          </div>
        </div>

        {/* Terms */}
        <div className="px-12 py-6 border-t border-gray-200">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            This quote is valid for 48 hours from the date of issue. Prices are subject to availability 
            and may change. Seats are not held until booking is confirmed with payment. 
            E-ticket will be issued within 24–48 hours of confirmed payment.
          </p>
        </div>

        {/* Footer */}
        <div className="px-12 py-6 bg-[#1a2332] text-white">
          <div className="flex items-center justify-between text-xs">
            <span>your-travel-agent.net</span>
            <span>deals@your-travel-agent.net</span>
          </div>
          <div className="mt-2 text-center text-[10px] text-gray-400">
            © {new Date().getFullYear()} Your Travel Agent
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
