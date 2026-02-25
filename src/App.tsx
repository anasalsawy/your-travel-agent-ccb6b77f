import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Vouchers from "./pages/Vouchers";
import VoucherDetail from "./pages/VoucherDetail";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Checkout from "./pages/Checkout";
import FAQ from "./pages/FAQ";
import Admin from "./pages/Admin";
import AdminDiagnostics from "./pages/AdminDiagnostics";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import About from "./pages/About";
import Contact from "./pages/Contact";
import RefundPolicy from "./pages/RefundPolicy";
import RequestTicket from "./pages/RequestTicket";
import CarRental from "./pages/CarRental";
import QuotePreview from "./pages/QuotePreview";
import Promo from "./pages/Promo";
import VoiceProxy from "./pages/VoiceProxy";
import { lazy, Suspense } from "react";

const MobileLogin = lazy(() => import("./pages/mobile-admin/MobileLogin"));
const MobileHome = lazy(() => import("./pages/mobile-admin/MobileHome"));
const MobileOrders = lazy(() => import("./pages/mobile-admin/MobileOrders"));
const MobileRequests = lazy(() => import("./pages/mobile-admin/MobileRequests"));
const MobileMaya = lazy(() => import("./pages/mobile-admin/MobileMaya"));
const MobileMore = lazy(() => import("./pages/mobile-admin/MobileMore"));
const MobileSendQuote = lazy(() => import("./pages/mobile-admin/MobileSendQuote"));
const MobileDevAgent = lazy(() => import("./pages/mobile-admin/MobileDevAgent"));
const MobileCarRentals = lazy(() => import("./pages/mobile-admin/MobileCarRentals"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense>
          <Routes>
            <Route path="/" element={<Index />} />
            {/* Mobile Admin App */}
            <Route path="/m/login" element={<MobileLogin />} />
            <Route path="/m" element={<MobileHome />} />
            <Route path="/m/orders" element={<MobileOrders />} />
            <Route path="/m/requests" element={<MobileRequests />} />
            <Route path="/m/maya" element={<MobileMaya />} />
            <Route path="/m/more" element={<MobileMore />} />
            <Route path="/m/send-quote" element={<MobileSendQuote />} />
            <Route path="/m/dev" element={<MobileDevAgent />} />
            <Route path="/m/car-rentals" element={<MobileCarRentals />} />
            {/* Legacy mobile-admin redirects */}
            <Route path="/mobile-admin" element={<Navigate to="/m" replace />} />
            <Route path="/mobile-admin/login" element={<Navigate to="/m/login" replace />} />
            <Route path="/mobile-admin/*" element={<Navigate to="/m" replace />} />
            {/* Website routes */}
            <Route path="/vouchers" element={<Vouchers />} />
            <Route path="/vouchers/:id" element={<VoucherDetail />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/checkout/voucher/:id" element={<Checkout />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/request-ticket" element={<RequestTicket />} />
            <Route path="/car-rental" element={<CarRental />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/diagnostics" element={<AdminDiagnostics />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/quote-preview" element={<QuotePreview />} />
            <Route path="/promo" element={<Promo />} />
            <Route path="/voice-proxy" element={<VoiceProxy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
