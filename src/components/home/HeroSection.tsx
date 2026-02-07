import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Ticket, Plane } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-gradient-hero">
      {/* Background effects */}
      <div className="absolute inset-0 bg-hero-pattern" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-glow" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-accent/10 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1s' }} />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-sm font-medium text-primary">Verified & Trusted Since 2020</span>
          </div>

          {/* Main heading */}
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 animate-slide-up">
            Your Travel.{" "}
            <span className="text-gradient">Our Expertise.</span>
          </h1>

          {/* Subheading */}
          <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: '0.2s' }}>
            We help you save on flights with verified travel credits and expert ticket booking. 
            Tell us where you want to go — we handle the rest.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.4s' }}>
            <Button variant="hero" size="xl" asChild>
              <Link to="/vouchers">
                <Ticket className="w-5 h-5" />
                Browse Vouchers
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <Button variant="heroOutline" size="xl" asChild>
              <Link to="/request-ticket">
                <Plane className="w-5 h-5" />
                Request a Ticket
              </Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 mt-16 max-w-lg mx-auto animate-slide-up" style={{ animationDelay: '0.6s' }}>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-display font-bold text-gradient">500+</div>
              <div className="text-sm text-muted-foreground">Vouchers Sold</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-display font-bold text-gradient">Big</div>
              <div className="text-sm text-muted-foreground">Savings</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-display font-bold text-gradient">24h</div>
              <div className="text-sm text-muted-foreground">Fast Delivery</div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-2">
          <div className="w-1 h-2 rounded-full bg-primary" />
        </div>
      </div>
    </section>
  );
}
