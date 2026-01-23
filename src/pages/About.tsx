import { Layout } from "@/components/layout/Layout";
import { Shield, Users, Plane, Award, CheckCircle, Globe } from "lucide-react";
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
              We're on a mission to make travel more affordable by connecting travelers with verified, discounted airline vouchers and providing expert ticket booking services.
            </p>
          </div>

          {/* Our Story */}
          <div className="prose prose-lg dark:prose-invert max-w-none mb-16">
            <section className="mb-12">
              <h2 className="font-display text-2xl font-semibold mb-4">Our Story</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Your Travel Agent was founded with a simple observation: millions of dollars in airline vouchers and travel credits go unused every year. Whether from cancelled flights, compensation for delays, or unused gift cards, these valuable credits often expire before travelers can use them.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We created a trusted marketplace where travelers can purchase verified vouchers at significant discounts, while sellers can recover value from credits they can't use themselves. Our platform brings transparency, security, and savings to the travel industry.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Today, we've helped thousands of travelers save on their flights while providing a secure platform for voucher transactions. Our dedicated team works around the clock to verify balances, facilitate secure payments, and ensure every customer has a smooth experience.
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
                  Every voucher is verified before listing. Secure payments with escrow protection for your peace of mind.
                </p>
              </div>
              <div className="glass-card p-6 text-center">
                <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Award className="w-6 h-6 text-success" />
                </div>
                <h3 className="font-display font-semibold mb-2">Real Savings</h3>
                <p className="text-sm text-muted-foreground">
                  Our customers save up to 70% on airline credits. We negotiate the best deals so you fly for less.
                </p>
              </div>
              <div className="glass-card p-6 text-center">
                <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-display font-semibold mb-2">Customer First</h3>
                <p className="text-sm text-muted-foreground">
                  Our support team is available to assist you through every step of your purchase or booking.
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
                    <h3 className="font-display font-semibold mb-2">Verified Travel Vouchers</h3>
                    <p className="text-sm text-muted-foreground">
                      Browse our marketplace of verified airline vouchers, flight credits, and gift cards from major carriers worldwide. Every listing is verified for balance and validity.
                    </p>
                  </div>
                </div>
              </div>
              <div className="glass-card p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Globe className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold mb-2">Custom Ticket Requests</h3>
                    <p className="text-sm text-muted-foreground">
                      Need a specific flight? Submit a ticket request and our travel experts will find you the best deal. We handle complex itineraries, group bookings, and last-minute travel.
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
                      Our secure escrow system holds funds until you confirm receipt. Buy and sell with confidence knowing your transaction is protected.
                    </p>
                  </div>
                </div>
              </div>
              <div className="glass-card p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold mb-2">Seller Marketplace</h3>
                    <p className="text-sm text-muted-foreground">
                      Have unused vouchers? Join our verified seller network and recover value from credits you can't use. We handle verification and secure payments.
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
              Browse our verified vouchers or submit a ticket request today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/vouchers" className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
                Browse Vouchers
              </a>
              <a href="/request-ticket" className="inline-flex items-center justify-center px-6 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors">
                Request a Ticket
              </a>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
