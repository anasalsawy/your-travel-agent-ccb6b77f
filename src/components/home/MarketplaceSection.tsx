import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, TrendingUp, Clock, DollarSign, Plane, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function MarketplaceSection() {
  const [stats, setStats] = useState({
    openListings: 0,
    activeSellers: 0,
    avgSavings: 28,
    avgResponseTime: "4h"
  });

  useEffect(() => {
    async function fetchStats() {
      // Get open listings count
      const { count: listingsCount } = await supabase
        .from('marketplace_listings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open');

      // Get active sellers count
      const { count: sellersCount } = await supabase
        .from('sellers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved');

      setStats(prev => ({
        ...prev,
        openListings: listingsCount || 0,
        activeSellers: sellersCount || 0
      }));
    }

    fetchStats();
  }, []);

  return (
    <section className="py-20 md:py-28 bg-gradient-to-b from-background via-primary/5 to-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        {/* Section header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6">
            <Store className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-accent">Travel Marketplace</span>
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">
            Get Bids From <span className="text-gradient">Verified Sellers</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Post your travel request and receive competitive bids from our network of verified travel agents. 
            Compare offers and save up to 70% on your next trip.
          </p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 max-w-4xl mx-auto">
          <StatCard
            icon={Plane}
            value={stats.openListings.toString()}
            label="Open Requests"
            color="text-primary"
          />
          <StatCard
            icon={Users}
            value={stats.activeSellers.toString()}
            label="Active Sellers"
            color="text-success"
          />
          <StatCard
            icon={TrendingUp}
            value={`${stats.avgSavings}%`}
            label="Avg. Savings"
            color="text-warning"
          />
          <StatCard
            icon={Clock}
            value={stats.avgResponseTime}
            label="Avg. Response"
            color="text-accent"
          />
        </div>

        {/* Main content grid */}
        <div className="grid lg:grid-cols-2 gap-8 items-center max-w-6xl mx-auto">
          {/* Left: How it works */}
          <div className="space-y-6">
            <h3 className="font-display text-2xl font-semibold">How the Marketplace Works</h3>
            
            <div className="space-y-4">
              <ProcessStep
                number={1}
                title="Post Your Travel Request"
                description="Tell us where you want to go, when, and your budget. We'll share it with our verified sellers."
              />
              <ProcessStep
                number={2}
                title="Receive Competitive Bids"
                description="Multiple travel agents compete to offer you the best price and service."
              />
              <ProcessStep
                number={3}
                title="Choose & Book"
                description="Compare offers, check seller ratings, and book with confidence through our secure escrow."
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button variant="hero" size="lg" asChild>
                <Link to="/request-ticket">
                  Post a Request
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link to="/marketplace">
                  Browse Marketplace
                </Link>
              </Button>
            </div>
          </div>

          {/* Right: Visual chart/activity */}
          <div className="glass-card p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h4 className="font-display font-semibold">Live Marketplace Activity</h4>
              <span className="text-xs text-muted-foreground">Updated live</span>
            </div>
            
            {/* Simple bar chart visualization */}
            <div className="space-y-4 mb-6">
              <ChartBar label="Economy Requests" percentage={75} color="bg-primary" />
              <ChartBar label="Business Class" percentage={45} color="bg-accent" />
              <ChartBar label="First Class" percentage={20} color="bg-warning" />
              <ChartBar label="Multi-City" percentage={35} color="bg-success" />
            </div>

            {/* Recent activity */}
            <div className="border-t border-border pt-4">
              <h5 className="text-sm font-medium mb-3">Recent Requests</h5>
              <div className="space-y-2">
                <ActivityItem route="NYC → London" class_type="Business" bids={4} />
                <ActivityItem route="LA → Tokyo" class_type="Economy" bids={7} />
                <ActivityItem route="Miami → Paris" class_type="First" bids={2} />
              </div>
            </div>
          </div>
        </div>

        {/* CTA for sellers */}
        <div className="mt-16 text-center">
          <div className="glass-card p-8 max-w-2xl mx-auto">
            <h3 className="font-display text-xl font-semibold mb-2">Are you a Travel Agent?</h3>
            <p className="text-muted-foreground mb-4">
              Join our network of verified sellers and gain access to qualified travel requests.
            </p>
            <Button variant="outline" asChild>
              <Link to="/seller/register">
                Become a Seller
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({ icon: Icon, value, label, color }: { icon: any; value: string; label: string; color: string }) {
  return (
    <div className="glass-card p-4 text-center hover-lift">
      <Icon className={`w-6 h-6 ${color} mx-auto mb-2`} />
      <div className="text-2xl md:text-3xl font-display font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ProcessStep({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-bold">
        {number}
      </div>
      <div>
        <h4 className="font-semibold mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ChartBar({ label, percentage, color }: { label: string; percentage: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="text-muted-foreground">{percentage}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} rounded-full transition-all duration-1000`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function ActivityItem({ route, class_type, bids }: { route: string; class_type: string; bids: number }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2">
        <Plane className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">{route}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">{class_type}</span>
        <span className="text-xs text-muted-foreground">{bids} bids</span>
      </div>
    </div>
  );
}
