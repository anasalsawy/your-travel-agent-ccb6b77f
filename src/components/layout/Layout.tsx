import { useEffect } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { PromoBanner } from "./PromoBanner";

// Declare custom element type for ElevenLabs widget
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { 'agent-id': string }, HTMLElement>;
    }
  }
}

interface LayoutProps {
  children: React.ReactNode;
  hideFooter?: boolean;
}

export function Layout({ children, hideFooter }: LayoutProps) {
  // Load ElevenLabs widget script (only once globally)
  useEffect(() => {
    if (document.querySelector('script[src*="elevenlabs/convai-widget-embed"]')) {
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <PromoBanner />
      <Header />
      <main className="flex-1" style={{ paddingTop: 'calc(var(--promo-banner-height, 0px) + 4rem)' }}>{children}</main>
      {!hideFooter && <Footer />}
      
      {/* ElevenLabs Voice Widget - Always visible on all pages */}
      <elevenlabs-convai agent-id="agent_2601kffzj5hhfyt9j1ec1t39jejg"></elevenlabs-convai>
    </div>
  );
}
