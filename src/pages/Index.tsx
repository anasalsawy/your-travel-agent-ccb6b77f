import { Layout } from "@/components/layout/Layout";
import { HeroSection } from "@/components/home/HeroSection";
import { MarketplaceSection } from "@/components/home/MarketplaceSection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { TrustSection } from "@/components/home/TrustSection";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { CTASection } from "@/components/home/CTASection";

const Index = () => {
  return (
    <Layout>
      <HeroSection />
      <MarketplaceSection />
      <HowItWorks />
      <TrustSection />
      <TestimonialsSection />
      <CTASection />
    </Layout>
  );
};

export default Index;
