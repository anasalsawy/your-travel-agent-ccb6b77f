import { Shield, Lock, Zap, HeadphonesIcon, BadgeCheck } from "lucide-react";

const trustItems = [
  {
    icon: Shield,
    title: "Verified Balances",
    description: "Every voucher balance is verified directly with the airline before listing.",
    color: "text-success",
  },
  {
    icon: BadgeCheck,
    title: "Escrow Protection",
    description: "Pay with Escrow.com for 100% buyer protection on every purchase.",
    color: "text-[#00A651]",
  },
  {
    icon: Zap,
    title: "Fast Delivery",
    description: "Most vouchers delivered within 24 hours. Some within minutes.",
    color: "text-warning",
  },
  {
    icon: HeadphonesIcon,
    title: "24/7 Support",
    description: "Our team is here to help with any questions or issues.",
    color: "text-accent",
  },
];

export function TrustSection() {
  return (
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        {/* Trust banner */}
        <div className="glass-card p-6 md:p-8 mb-16 text-center max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="w-6 h-6 text-success" />
            <span className="font-display text-xl font-semibold">Verified & Compliant</span>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl mx-auto">
            All vouchers undergo rigorous verification. We only list authentic airline credits 
            with confirmed balances and valid expiration dates.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {trustItems.map((item, index) => (
            <div
              key={item.title}
              className="glass-card p-6 hover-lift group"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className={`w-12 h-12 rounded-xl bg-card flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${item.color}`}>
                <item.icon className="w-6 h-6" />
              </div>
              <h3 className="font-display font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
