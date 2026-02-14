import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Car, Plane } from "lucide-react";

export function CTASection() {
  return (
    <section className="py-20 md:py-28 relative overflow-hidden">
      {/* Background effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="glass-card p-10 md:p-16 text-center max-w-4xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Ready to Save on Your Next Trip?
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            Whether you need a flight or a rental car, we've got you covered with the best deals and personalized service.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 flex-wrap">
            <Button variant="hero" size="xl" asChild>
              <Link to="/vouchers">
                Browse All Vouchers
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <Button variant="glass" size="xl" asChild>
              <Link to="/request-ticket">
                <Plane className="w-5 h-5" />
                Request a Flight
              </Link>
            </Button>
            <Button variant="glass" size="xl" asChild>
              <Link to="/car-rental">
                <Car className="w-5 h-5" />
                Rent a Car
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
