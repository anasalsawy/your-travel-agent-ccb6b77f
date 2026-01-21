import { Link } from "react-router-dom";
import { useEffect } from "react";
import { Mail, Shield, Lock } from "lucide-react";
import { SupportButtons, FacebookLink } from "@/components/SupportButtons";
import logo from "@/assets/logo-black-gold-shield.png";

// Declare custom element type for ElevenLabs widget
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { 'agent-id': string }, HTMLElement>;
    }
  }
}

export function Footer() {
  // Load ElevenLabs widget script (only once, don't remove on unmount)
  useEffect(() => {
    // Check if script already exists
    if (document.querySelector('script[src*="elevenlabs/convai-widget-embed"]')) {
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
    script.async = true;
    document.body.appendChild(script);
    
    // Don't remove script on unmount - widget should persist
  }, []);

  return (
    <footer className="bg-card border-t border-border">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <img src={logo} alt="Your Travel Agent" className="w-10 h-10 object-contain" />
              <span className="font-display font-bold text-lg">Your Travel Agent</span>
            </Link>
            <p className="text-muted-foreground text-sm mb-4">
              Your trusted source for verified travel vouchers and discounted flight tickets.
            </p>
            <FacebookLink />
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/vouchers" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Browse Vouchers
                </Link>
              </li>
              <li>
                <Link
                  to="/request-ticket"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Request a Ticket
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Policies */}
          <div>
            <h4 className="font-display font-semibold mb-4">Policies</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/terms" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  to="/refund-policy"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-display font-semibold mb-4">Get Support</h4>
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-success" />
                <span>Verified Balances</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="w-4 h-4 text-primary" />
                <span>Secure Payments</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="w-4 h-4 text-accent" />
                <span>Fast Delivery</span>
              </div>
            </div>
            <SupportButtons variant="inline" />
          </div>
        </div>

        <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Your Travel Agent. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">Travel vouchers are subject to airline terms and conditions.</p>
        </div>
      </div>
      
      {/* ElevenLabs Voice Widget */}
      <elevenlabs-convai agent-id="agent_2601kffzj5hhfyt9j1ec1t39jejg"></elevenlabs-convai>
    </footer>
  );
}
