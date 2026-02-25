import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Shield, Wand2, Lock } from "lucide-react";
import { toast } from "sonner";

export default function MobileLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const navigate = useNavigate();

  // Auto-redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        // Verify admin/staff role
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .in("role", ["admin", "staff"]);

        if (roles?.length) {
          navigate("/m", { replace: true });
          return;
        }
      }
      setCheckingSession(false);
    });

    // Listen for auth changes (magic link callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .in("role", ["admin", "staff"]);

        if (roles?.length) {
          navigate("/m", { replace: true });
        } else {
          toast.error("Access denied. Admin or staff role required.");
          await supabase.auth.signOut();
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/m`,
      },
    });

    if (error) {
      toast.error(error.message);
    } else {
      setMagicLinkSent(true);
      toast.success("Magic link sent! Check your email.");
    }
    setLoading(false);
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .in("role", ["admin", "staff"]);

    if (!roles?.length) {
      toast.error("Access denied. Admin or staff role required.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    navigate("/m");
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (magicLinkSent) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
            <Wand2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-display">Check Your Email</h1>
          <p className="text-muted-foreground">
            Magic link sent to <span className="text-foreground font-medium">{email}</span>. 
            Tap the link to sign in instantly.
          </p>
          <Button variant="outline" onClick={() => { setMagicLinkSent(false); setEmail(""); }} className="rounded-xl">
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-display">Admin Access</h1>
          <p className="text-sm text-muted-foreground">Your Travel Agent · Command Center</p>
        </div>

        {usePassword ? (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-secondary/50 border-border/30 rounded-xl h-12"
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-secondary/50 border-border/30 rounded-xl h-12"
            />
            <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl text-base font-semibold">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
            </Button>
            <button
              type="button"
              onClick={() => setUsePassword(false)}
              className="w-full text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1.5"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Use magic link instead
            </button>
          </form>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <Input
              type="email"
              placeholder="Admin email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-secondary/50 border-border/30 rounded-xl h-12"
            />
            <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl text-base font-semibold gap-2">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Send Magic Link
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Enter your admin email and we'll send you a one-tap login link. No password needed.
            </p>
            <button
              type="button"
              onClick={() => setUsePassword(true)}
              className="w-full text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              Use password instead
            </button>
          </form>
        )}
      </div>
    </div>
  );
}