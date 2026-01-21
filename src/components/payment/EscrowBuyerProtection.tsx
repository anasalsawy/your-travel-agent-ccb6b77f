import { Shield, CheckCircle2, Lock, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Escrow.com brand colors
const ESCROW_GREEN = "#00A651";
const ESCROW_DARK = "#1a1a2e";

export function EscrowIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" fill={ESCROW_GREEN} />
      <path 
        d="M7 12h10M7 8h6M7 16h8" 
        stroke="white" 
        strokeWidth="1.5" 
        strokeLinecap="round"
      />
      <circle cx="18" cy="8" r="2" fill="white" />
    </svg>
  );
}

export function EscrowTrustBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Badge 
        variant="outline" 
        className="text-[10px] px-1.5 py-0.5 border-[#00A651]/50 text-[#00A651] bg-[#00A651]/10"
      >
        <Shield className="w-2.5 h-2.5 mr-0.5" />
        Escrow Protected
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-[#00A651] font-medium">
      <Shield className="w-3.5 h-3.5" />
      <span>Escrow.com Protected</span>
    </div>
  );
}

export function EscrowBuyerProtection() {
  return (
    <div className="p-4 rounded-xl bg-[#00A651]/10 border border-[#00A651]/30 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#00A651] flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h4 className="font-semibold text-[#00A651]">Escrow.com Protection</h4>
          <p className="text-xs text-muted-foreground">Licensed & regulated escrow service</p>
        </div>
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#00A651] mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">Secure Funds</strong> – Your payment is held safely until you receive and verify your voucher
          </span>
        </div>
        <div className="flex items-start gap-2">
          <Lock className="w-4 h-4 text-[#00A651] mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">Licensed Service</strong> – Escrow.com is fully licensed and regulated
          </span>
        </div>
        <div className="flex items-start gap-2">
          <Clock className="w-4 h-4 text-[#00A651] mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">Inspection Period</strong> – Verify your voucher before funds are released
          </span>
        </div>
      </div>

      <div className="pt-2 border-t border-[#00A651]/20">
        <p className="text-xs text-muted-foreground">
          Escrow.com has facilitated over $5 billion in secure transactions since 1999.
        </p>
      </div>
    </div>
  );
}

export function EscrowHowItWorks() {
  const steps = [
    { step: 1, title: "Pay to Escrow", description: "Your funds are held securely" },
    { step: 2, title: "Receive Voucher", description: "We deliver your verified voucher" },
    { step: 3, title: "Verify & Accept", description: "Confirm the voucher works" },
    { step: 4, title: "Funds Released", description: "Payment released to seller" },
  ];

  return (
    <div className="p-4 rounded-xl bg-card/50 border border-border space-y-4">
      <h4 className="font-semibold text-sm">How Escrow.com Works</h4>
      <div className="grid grid-cols-2 gap-3">
        {steps.map((item) => (
          <div key={item.step} className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-[#00A651] text-white text-xs flex items-center justify-center shrink-0">
              {item.step}
            </div>
            <div>
              <p className="text-xs font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
