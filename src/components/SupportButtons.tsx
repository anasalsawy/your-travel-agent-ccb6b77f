import { MessageCircle, Facebook } from "lucide-react";
import { Button } from "@/components/ui/button";

const WHATSAPP_NUMBER = "17137326633";
const FACEBOOK_PAGE_URL = "https://www.facebook.com/share/1AakVi3vCy/";
const MESSENGER_URL = "https://m.me/share/1AakVi3vCy";

interface SupportButtonsProps {
  variant?: "default" | "compact" | "inline";
  showLabels?: boolean;
  className?: string;
}

export function SupportButtons({ variant = "default", showLabels = true, className = "" }: SupportButtonsProps) {
  const openWhatsApp = () => {
    const message = encodeURIComponent("Hi! I have a question about your travel services.");
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, "_blank");
  };

  const openMessenger = () => {
    window.open(MESSENGER_URL, "_blank");
  };

  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={openWhatsApp}
          className="text-[#25D366] hover:text-[#25D366] hover:bg-[#25D366]/10"
          title="Chat on WhatsApp"
        >
          <MessageCircle className="w-5 h-5" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={openMessenger}
          className="text-[#0084FF] hover:text-[#0084FF] hover:bg-[#0084FF]/10"
          title="Message on Facebook"
        >
          <Facebook className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className={`flex flex-wrap items-center gap-3 ${className}`}>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={openWhatsApp}
          className="gap-2 border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/10 hover:border-[#25D366]/50"
        >
          <MessageCircle className="w-4 h-4" />
          {showLabels && "WhatsApp"}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={openMessenger}
          className="gap-2 border-[#0084FF]/30 text-[#0084FF] hover:bg-[#0084FF]/10 hover:border-[#0084FF]/50"
        >
          <Facebook className="w-4 h-4" />
          {showLabels && "Messenger"}
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col sm:flex-row gap-3 ${className}`}>
      <Button 
        variant="outline" 
        onClick={openWhatsApp}
        className="gap-2 border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/10 hover:border-[#25D366]/50"
      >
        <MessageCircle className="w-5 h-5" />
        {showLabels && "Chat on WhatsApp"}
      </Button>
      <Button 
        variant="outline" 
        onClick={openMessenger}
        className="gap-2 border-[#0084FF]/30 text-[#0084FF] hover:bg-[#0084FF]/10 hover:border-[#0084FF]/50"
      >
        <Facebook className="w-5 h-5" />
        {showLabels && "Message on Facebook"}
      </Button>
    </div>
  );
}

export function FacebookLink({ className = "" }: { className?: string }) {
  return (
    <a 
      href={FACEBOOK_PAGE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 text-sm text-muted-foreground hover:text-[#0084FF] transition-colors ${className}`}
    >
      <Facebook className="w-4 h-4" />
      <span>Find us on Facebook</span>
    </a>
  );
}
