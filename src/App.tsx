import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Vouchers from "./pages/Vouchers";
import VoucherDetail from "./pages/VoucherDetail";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import RequestTicket from "./pages/RequestTicket";
import Checkout from "./pages/Checkout";
import FAQ from "./pages/FAQ";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/vouchers" element={<Vouchers />} />
          <Route path="/vouchers/:id" element={<VoucherDetail />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/request-ticket" element={<RequestTicket />} />
          <Route path="/checkout/voucher/:id" element={<Checkout />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
