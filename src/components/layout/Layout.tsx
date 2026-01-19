import { Header } from "./Header";
import { Footer } from "./Footer";
import { PromoBanner } from "./PromoBanner";
import { ChatWidget } from "@/components/chat/ChatWidget";

interface LayoutProps {
  children: React.ReactNode;
  hideFooter?: boolean;
}

export function Layout({ children, hideFooter }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <PromoBanner />
      <Header />
      <main className="flex-1" style={{ paddingTop: 'calc(var(--promo-banner-height, 0px) + 4rem)' }}>{children}</main>
      {!hideFooter && <Footer />}
      <ChatWidget />
    </div>
  );
}
