import { Shield, Lock, ArrowRight, BadgeCheck, CreditCard, CheckCircle, Clock, Wallet } from "lucide-react";
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

  const steps = [
    {
      step: 1,
      icon: CreditCard,
      title: "You Pay Escrow.com",
      description: "Your money goes to a secure, neutral account — not to us yet",
    },
    {
      step: 2,
      icon: Clock,
      title: "We Deliver Your Voucher",
      description: "You receive your travel voucher with all details and instructions",
    },
    {
      step: 3,
      icon: CheckCircle,
      title: "You Verify It Works",
      description: "Test the voucher, check the balance, make sure everything is correct",
    },
    {
      step: 4,
      icon: Wallet,
      title: "Payment Released",
      description: "Only after you approve, Escrow.com releases the funds to us",
    },
  ];

  return (
    <section className="py-20 md:py-28 relative overflow-hidden bg-gradient-to-b from-[#00A651]/5 via-background to-background">
      {/* Background decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#00A651]/10 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#00A651]/10 border border-[#00A651]/30 mb-6">
            <Shield className="w-4 h-4 text-[#00A651]" />
            <span className="text-sm font-semibold text-[#00A651]">Powered by Escrow.com</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Pay with <span className="text-[#00A651]">100% Protection</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            We use <strong className="text-foreground">Escrow.com</strong> — the world's most secure online payment platform. 
            Your money is protected until you're completely satisfied.
          </p>
        </div>

        {/* How It Works - Step by Step */}
        <div className="max-w-5xl mx-auto mb-16">
          <div className="glass-card p-8 md:p-12">
            <h3 className="font-display text-2xl font-bold text-center mb-10">
              How Secure Payment Works
            </h3>
            
            {/* Steps Grid */}
            <div className="grid md:grid-cols-4 gap-6 md:gap-4 relative">
              {/* Connecting line (desktop only) */}
              <div className="hidden md:block absolute top-12 left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-[#00A651]/20 via-[#00A651] to-[#00A651]/20" />
              
              {steps.map((item, index) => (
                <div key={item.step} className="relative text-center group">
                  {/* Step number circle */}
                  <div className="w-24 h-24 mx-auto mb-6 relative">
                    <div className="absolute inset-0 bg-[#00A651]/10 rounded-full group-hover:bg-[#00A651]/20 transition-colors" />
                    <div className="absolute inset-2 bg-card rounded-full border-2 border-[#00A651] flex items-center justify-center shadow-lg shadow-[#00A651]/20">
                      <item.icon className="w-8 h-8 text-[#00A651]" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-[#00A651] rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg">
                      {item.step}
                    </div>
                  </div>
                  
                  <h4 className="font-semibold text-lg mb-2">{item.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                  
                  {/* Arrow between steps (mobile) */}
                  {index < 3 && (
                    <div className="md:hidden flex justify-center my-4">
                      <ArrowRight className="w-6 h-6 text-[#00A651] rotate-90" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
          {benefits.map((benefit) => (
            <div 
              key={benefit.title}
              className="glass-card p-6 hover:border-[#00A651]/50 transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#00A651]/10 flex items-center justify-center mb-4 group-hover:bg-[#00A651]/20 group-hover:scale-110 transition-all">
                <benefit.icon className="w-7 h-7 text-[#00A651]" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{benefit.title}</h3>
              <p className="text-muted-foreground">{benefit.description}</p>
            </div>
          ))}
        </div>

        {/* Trust Badge & CTA */}
        <div className="text-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-4 mb-6">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border">
              <Lock className="w-4 h-4 text-[#00A651]" />
              <span className="text-sm font-medium">$5+ Billion Secured</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border">
              <BadgeCheck className="w-4 h-4 text-[#00A651]" />
              <span className="text-sm font-medium">Licensed in 50 States</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border">
              <Shield className="w-4 h-4 text-[#00A651]" />
              <span className="text-sm font-medium">BBB A+ Rated</span>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="xl" className="bg-[#00A651] hover:bg-[#00A651]/90 text-white gap-2 shadow-lg shadow-[#00A651]/30">
              <Link to="/vouchers">
                Browse Vouchers with Escrow Protection
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Select "Escrow.com" at checkout • No risk • Full refund if anything goes wrong
          </p>
        </div>
      </div>
    </section>
  );
}
