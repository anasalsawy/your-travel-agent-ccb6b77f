import { Shield, CheckCircle2, Lock, ArrowRight, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function EscrowPromoSection() {
  const benefits = [
    {
      icon: Shield,
      title: "100% Buyer Protection",
      description: "Your funds are held securely until you verify your voucher works",
    },
    {
      icon: Lock,
      title: "Licensed & Regulated",
      description: "Escrow.com is fully licensed and has facilitated $5B+ in transactions",
    },
    {
      icon: BadgeCheck,
      title: "Inspection Period",
      description: "Test your voucher before payment is released to the seller",
    },
  ];

  return (
    <section className="py-16 md:py-24 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#00A651]/5 to-transparent pointer-events-none" />
      
      <div className="container mx-auto px-4 relative">
        <div className="max-w-5xl mx-auto">
          {/* Main promo card */}
          <div className="glass-card p-8 md:p-12 relative overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#00A651]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#00A651]/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center gap-6 mb-10">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-[#00A651] flex items-center justify-center shrink-0 shadow-lg shadow-[#00A651]/30">
                  <Shield className="w-8 h-8 md:w-10 md:h-10 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-3 py-1 rounded-full bg-[#00A651]/20 text-[#00A651] text-xs font-semibold uppercase tracking-wide">
                      New Payment Option
                    </span>
                  </div>
                  <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">
                    Pay with <span className="text-[#00A651]">Escrow.com</span> Protection
                  </h2>
                  <p className="text-muted-foreground max-w-xl">
                    The safest way to buy travel vouchers online. Your payment is protected until you verify everything works perfectly.
                  </p>
                </div>
              </div>

              {/* Benefits grid */}
              <div className="grid md:grid-cols-3 gap-6 mb-10">
                {benefits.map((benefit, index) => (
                  <div 
                    key={benefit.title}
                    className="p-5 rounded-xl bg-card/50 border border-border hover:border-[#00A651]/30 transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#00A651]/10 flex items-center justify-center mb-4 group-hover:bg-[#00A651]/20 transition-colors">
                      <benefit.icon className="w-5 h-5 text-[#00A651]" />
                    </div>
                    <h3 className="font-semibold mb-2">{benefit.title}</h3>
                    <p className="text-sm text-muted-foreground">{benefit.description}</p>
                  </div>
                ))}
              </div>

              {/* How it works */}
              <div className="p-6 rounded-xl bg-[#00A651]/5 border border-[#00A651]/20 mb-8">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#00A651]" />
                  How Escrow Protection Works
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { step: 1, text: "You pay to Escrow.com" },
                    { step: 2, text: "We deliver your voucher" },
                    { step: 3, text: "You verify it works" },
                    { step: 4, text: "Payment released to us" },
                  ].map((item, i) => (
                    <div key={item.step} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#00A651] text-white font-bold text-sm flex items-center justify-center shrink-0">
                        {item.step}
                      </div>
                      <span className="text-sm">{item.text}</span>
                      {i < 3 && (
                        <ArrowRight className="w-4 h-4 text-muted-foreground hidden md:block" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <Button asChild size="lg" className="bg-[#00A651] hover:bg-[#00A651]/90 text-white gap-2">
                  <Link to="/vouchers">
                    Browse Vouchers
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <p className="text-sm text-muted-foreground">
                  Select "Escrow.com" at checkout for maximum protection
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
