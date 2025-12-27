import { Search, CreditCard, Mail } from "lucide-react";

const steps = [
  {
    icon: Search,
    title: "Browse & Select",
    description: "Find verified vouchers from top airlines at discounted prices.",
  },
  {
    icon: CreditCard,
    title: "Secure Checkout",
    description: "Pay safely with card or Bitcoin. All transactions protected.",
  },
  {
    icon: Mail,
    title: "Instant Delivery",
    description: "Receive voucher codes and redemption instructions via email.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 md:py-28 bg-gradient-dark">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            How It Works
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Get your discounted travel vouchers in three simple steps
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="relative group"
              style={{ animationDelay: `${index * 0.2}s` }}
            >
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-16 left-[60%] w-[80%] h-px bg-gradient-to-r from-primary/50 to-transparent" />
              )}
              
              <div className="glass-card p-8 text-center hover-lift">
                {/* Step number */}
                <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
                  {index + 1}
                </div>
                
                {/* Icon */}
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <step.icon className="w-8 h-8 text-primary" />
                </div>
                
                <h3 className="font-display text-xl font-semibold mb-3">
                  {step.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
