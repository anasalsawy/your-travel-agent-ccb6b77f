import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Plane, Shield, CheckCircle, Zap, CreditCard, Banknote, Bitcoin } from "lucide-react";
import logo from "@/assets/logo-black-gold-shield.png";

const popularTrips = [
  { route: "Manila → Los Angeles (MNL–LAX)", marketPrice: 1200, },
  { route: "Seattle → Phoenix (SEA–PHX)", marketPrice: 380, },
  { route: "New York → London (JFK–LHR)", marketPrice: 950, },
  { route: "Los Angeles → Tokyo (LAX–NRT)", marketPrice: 1400, },
  { route: "Chicago → Miami (ORD–MIA)", marketPrice: 320, },
  { route: "San Francisco → Honolulu (SFO–HNL)", marketPrice: 580, },
];

const paymentMethods = [
  { name: "Credit / Debit Card", icon: CreditCard, description: "Visa, Mastercard, Amex via Stripe" },
  { name: "Zelle", icon: Banknote, description: "Instant bank transfer" },
  { name: "PayPal", icon: Banknote, description: "payments@yourtravelagent.com" },
  { name: "Crypto", icon: Bitcoin, description: "Bitcoin & other cryptocurrencies" },
];

export default function Promo() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3">
              <img src={logo} alt="Your Travel Agent" className="w-10 h-10 object-contain" />
              <span className="font-display font-bold text-lg">Your Travel Agent</span>
            </Link>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" asChild>
                <Link to="/request-ticket">Request a Quote</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero / Ad Section */}
      <section className="relative py-20 md:py-28 overflow-hidden bg-gradient-hero">
        <div className="absolute inset-0 bg-hero-pattern" />
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-accent/10 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: "1s" }} />

        <div className="container mx-auto px-4 relative z-10 text-center">
          {/* Logo large */}
          <div className="flex justify-center mb-8 animate-fade-in">
            <img src={logo} alt="Your Travel Agent" className="w-24 h-24 md:w-32 md:h-32 object-contain drop-shadow-2xl" />
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-success/10 border border-success/20 mb-6 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-sm font-bold text-success">Verified & Trusted Since 2020</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 animate-slide-up">
            Lowest Flight Prices{" "}
            <span className="text-gradient">Guaranteed.</span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-4 max-w-3xl mx-auto animate-slide-up" style={{ animationDelay: "0.15s" }}>
            Tell us the lowest offer you found —{" "}
            <span className="text-foreground font-semibold">we will beat it.</span>
          </p>

          <p className="text-base text-muted-foreground mb-10 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: "0.3s" }}>
            We leverage exclusive travel credits and wholesale inventory to get you flights at prices you won't find anywhere else.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: "0.45s" }}>
            <Button variant="hero" size="xl" asChild>
              <Link to="/request-ticket">
                <Plane className="w-5 h-5" />
                Submit Travel Request
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <Button variant="heroOutline" size="xl" asChild>
              <Link to="/">
                Chat with Maya
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Popular Trips / Price Comparison */}
      <section className="py-20 md:py-28 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-primary">REAL SAVINGS ON POPULAR ROUTES</span>
            </div>
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              See How Much You <span className="text-gradient">Save</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Average market prices vs. our guaranteed prices. No hidden fees, no gimmicks.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {popularTrips.map((trip) => {
              const ourPrice = Math.round(trip.marketPrice * 0.4);
              const saved = trip.marketPrice - ourPrice;
              return (
                <div key={trip.route} className="glass-card p-6 hover-lift group">
                  <div className="flex items-center gap-2 mb-4">
                    <Plane className="w-5 h-5 text-primary" />
                    <h3 className="font-display font-bold text-base">{trip.route}</h3>
                  </div>

                  <div className="space-y-2 mb-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Avg. Market Price</span>
                      <span className="text-lg text-muted-foreground line-through">${trip.marketPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">Our Price</span>
                      <span className="text-2xl font-display font-bold text-gradient">${ourPrice.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-border/50">
                    <div className="discount-badge">
                      You save ${saved.toLocaleString()}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom CTA */}
          <div className="text-center mt-14">
            <p className="text-muted-foreground mb-6 text-lg">
              Don't see your route? <span className="text-foreground font-semibold">We cover every airline and destination worldwide.</span>
            </p>
            <Button variant="hero" size="xl" asChild>
              <Link to="/request-ticket">
                Get Your Custom Quote
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Price Match Guarantee */}
      <section className="py-16 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="glass-card p-10 md:p-16 text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-warning/10 border border-warning/20 mb-6">
              <Shield className="w-5 h-5 text-warning" />
              <span className="font-bold text-warning">Price Match Promise</span>
            </div>

            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
              Found a Lower Price?{" "}
              <span className="text-gradient">We'll Beat It.</span>
            </h2>

            <p className="text-lg text-muted-foreground mb-4 max-w-2xl mx-auto">
              Send us the best quote you've found from any airline, travel agency, or booking platform.
              We guarantee to match or beat it — or we'll tell you honestly if we can't.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-success" />
                No hidden fees
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-success" />
                Same-day quotes
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-success" />
                Real human support
              </div>
            </div>

            <Button variant="hero" size="xl" asChild>
              <Link to="/request-ticket">
                Submit Your Travel Request
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Payment Methods */}
      <section className="py-20 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Flexible <span className="text-gradient">Payment Options</span>
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Pay the way that works best for you. All transactions are secure and verified.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {paymentMethods.map((method) => (
              <div key={method.name} className="glass-card p-6 text-center hover-lift">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <method.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-display font-bold mb-1">{method.name}</h3>
                <p className="text-sm text-muted-foreground">{method.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 border-t border-border/50">
        <div className="container mx-auto px-4 text-center">
          <p className="text-muted-foreground mb-2">Ready to fly for less?</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="hero" size="lg" asChild>
              <Link to="/request-ticket">
                <Plane className="w-5 h-5" />
                Request a Quote Now
              </Link>
            </Button>
            <Button variant="glass" size="lg" asChild>
              <Link to="/">
                Chat with Maya
              </Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-6">
            © {new Date().getFullYear()} Your Travel Agent. All rights reserved.
          </p>
        </div>
      </section>
    </div>
  );
}
