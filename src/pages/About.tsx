import { Layout } from "@/components/layout/Layout";
import { Shield, Users, Plane, Award, Car, Globe } from "lucide-react";
import logo from "@/assets/logo-black-gold-shield.png";

export default function About() {
  return (
    <Layout>
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Hero */}
          <div className="text-center mb-16">
            <div className="flex justify-center mb-6">
              <img src={logo} alt="Your Travel Agent" className="w-20 h-20 object-contain" />
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-6">About Your Travel Agent</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              We're on a mission to make travel more affordable by combining old-school concierge service with smart pricing — so you can fly and drive for less, without the hassle.
            </p>
          </div>

          {/* Our Story */}
          <div className="prose prose-lg dark:prose-invert max-w-none mb-16">
            <section className="mb-12">
              <h2 className="font-display text-2xl font-semibold mb-4">Our Story</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Your Travel Agent was founded on a simple idea: booking travel shouldn't feel like a second job. Comparing dozens of sites, hunting for promo codes, and second-guessing every price wastes hours and rarely lands the real best deal.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We built a personal concierge service where a real travel expert — backed by smart tooling and our AI assistant Maya — does the searching for you. You share your trip, we send back the best quote we can find, and you decide.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Today we help travelers around the world save on flights and rental cars while making the booking experience feel personal again.
              </p>
            </section>
          </div>

          {/* Values */}
          <div className="mb-16">
            <h2 className="font-display text-2xl font-semibold mb-8 text-center">What We Stand For</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="glass-card p-6 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display font-semibold mb-2">Trust & Security</h3>
                <p className="text-sm text-muted-foreground">
                  Transparent pricing, secure payments, and optional Escrow.com protection on every booking.
                </p>
              </div>
              <div className="glass-card p-6 text-center">
                <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Award className="w-6 h-6 text-success" />
                </div>
                <h3 className="font-display font-semibold mb-2">Real Savings</h3>
                <p className="text-sm text-muted-foreground">
                  Lowest price guarantee — find a better deal anywhere and we'll beat it.
                </p>
              </div>
              <div className="glass-card p-6 text-center">
                <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-display font-semibold mb-2">Customer First</h3>
                <p className="text-sm text-muted-foreground">
                  Our support team is available to help you through every step of your trip.
                </p>
              </div>
            </div>
          </div>

          {/* What We Offer */}
          <div className="mb-16">
            <h2 className="font-display text-2xl font-semibold mb-8 text-center">Our Services</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="glass-card p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Plane className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold mb-2">Custom Flight Quotes</h3>
                    <p className="text-sm text-muted-foreground">
                      Submit a request and our travel experts will find you the best deal. We handle complex itineraries, group bookings, and last-minute travel.
                    </p>
                  </div>
                </div>
              </div>
              <div className="glass-card p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Car className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold mb-2">Car Rentals</h3>
                    <p className="text-sm text-muted-foreground">
                      From compact city cars to luxury SUVs — we shop suppliers worldwide to find you the best price.
                    </p>
                  </div>
                </div>
              </div>
              <div className="glass-card p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold mb-2">Escrow Protection</h3>
                    <p className="text-sm text-muted-foreground">
                      Optional Escrow.com payment protection holds your funds until your booking is confirmed and you're satisfied.
                    </p>
                  </div>
                </div>
              </div>
              <div className="glass-card p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Globe className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold mb-2">Maya AI Assistant</h3>
                    <p className="text-sm text-muted-foreground">
                      Our AI travel agent is available 24/7 to answer questions, suggest destinations, and help you prep your request.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="glass-card p-8 mb-16">
            <h2 className="font-display text-2xl font-semibold mb-8 text-center">Trusted by Travelers</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div>
                <p className="text-3xl font-bold text-primary mb-1">10K+</p>
                <p className="text-sm text-muted-foreground">Happy Customers</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-success mb-1">$2M+</p>
                <p className="text-sm text-muted-foreground">Customer Savings</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-accent mb-1">50+</p>
                <p className="text-sm text-muted-foreground">Partner Airlines</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-warning mb-1">99%</p>
                <p className="text-sm text-muted-foreground">Satisfaction Rate</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <h2 className="font-display text-2xl font-semibold mb-4">Ready to Save on Travel?</h2>
            <p className="text-muted-foreground mb-6">
              Submit a flight request or rental quote today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/request-ticket" className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
                Request a Flight
              </a>
              <a href="/car-rental" className="inline-flex items-center justify-center px-6 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors">
                Rent a Car
              </a>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
