import { Shield, CheckCircle2, Lock, RefreshCw } from "lucide-react";

export function PayPalBuyerProtection() {
  return (
    <div className="p-4 rounded-xl bg-gradient-to-br from-[#0070BA]/10 to-[#003087]/10 border border-[#0070BA]/30 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#0070BA]/20 flex items-center justify-center">
          <Shield className="w-5 h-5 text-[#0070BA]" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">PayPal Buyer Protection</h4>
          <p className="text-xs text-muted-foreground">Your money is protected</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-2">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Full Refund Guarantee</span> — Get your money back if item isn't delivered
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Lock className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Secure Encryption</span> — Your financial info is never shared
          </p>
        </div>
        <div className="flex items-start gap-2">
          <RefreshCw className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">180-Day Protection</span> — Dispute resolution available for 6 months
          </p>
        </div>
      </div>
    </div>
  );
}

export function PayPalTrustBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#0070BA]/10 border border-[#0070BA]/20">
        <Shield className="w-3 h-3 text-[#0070BA]" />
        <span className="text-[10px] font-medium text-[#0070BA]">Buyer Protected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-[#0070BA]/5 border border-[#0070BA]/10">
      <Shield className="w-4 h-4 text-[#0070BA]" />
      <span className="text-xs font-medium text-[#0070BA]">PayPal Buyer Protection</span>
    </div>
  );
}

export function PayPalIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.773.773 0 0 1 .763-.654h6.18c2.098 0 3.564.563 4.368 1.67.349.481.562 1.005.653 1.607.096.63.05 1.398-.138 2.335l-.004.016v.467l.365.206c.308.166.555.358.751.577.317.354.523.793.613 1.304.093.532.069 1.165-.071 1.881-.161.823-.422 1.539-.779 2.126-.332.545-.755 1.001-1.253 1.35a4.88 4.88 0 0 1-1.608.732c-.596.152-1.259.227-1.969.227h-.467a1.426 1.426 0 0 0-1.406 1.2l-.035.2-.59 3.748-.027.144a.159.159 0 0 1-.159.136H7.076Z" fill="#253B80"/>
      <path d="M19.817 7.86c-.014.093-.03.188-.048.286-.616 3.163-2.726 4.255-5.42 4.255H12.7a.667.667 0 0 0-.658.563l-.848 5.379-.24 1.525a.35.35 0 0 0 .346.406h2.431a.585.585 0 0 0 .578-.494l.024-.125.458-2.9.029-.16a.585.585 0 0 1 .577-.494h.365c2.355 0 4.2-.957 4.74-3.724.226-.757.11-1.541-.486-2.035a1.724 1.724 0 0 0-.199-.148Z" fill="#179BD7"/>
      <path d="M18.817 7.465a4.79 4.79 0 0 0-.59-.131 7.47 7.47 0 0 0-1.188-.087h-3.594a.577.577 0 0 0-.578.494l-.76 4.846-.023.145a.667.667 0 0 1 .658-.563h1.65c2.693 0 4.803-1.092 5.42-4.255.018-.098.034-.193.047-.286a3.009 3.009 0 0 0-.458-.196c-.172-.013-.323.02-.584.033Z" fill="#222D65"/>
    </svg>
  );
}
