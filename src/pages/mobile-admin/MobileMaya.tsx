import { useState, useEffect } from "react";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, User, AlertTriangle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function MobileMaya() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("ai_conversations")
        .select("*, ai_chat_messages(content, role, created_at)")
        .order("updated_at", { ascending: false })
        .limit(30);
      setConversations(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = conversations.filter(
    (c) =>
      `${c.customer_name || ""} ${c.customer_email || ""} ${c.customer_phone || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <MobileAdminLayout title="Maya Conversations">
      <div className="px-4 pt-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-border/30 rounded-xl"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((convo) => {
              const lastMsg = convo.ai_chat_messages
                ?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
              const msgCount = convo.ai_chat_messages?.length || 0;

              return (
                <div
                  key={convo.id}
                  className="bg-card border border-border/30 rounded-xl p-4 active:bg-secondary transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold truncate">
                          {convo.customer_name || convo.customer_email || "Anonymous"}
                        </p>
                        {convo.needs_admin_attention && (
                          <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        {convo.is_serious && (
                          <Badge variant="outline" className="text-[9px] bg-success/20 text-success border-success/30">Serious</Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">{msgCount} msgs</span>
                      </div>
                      {lastMsg && (
                        <p className="text-xs text-muted-foreground truncate">
                          {lastMsg.role === "assistant" ? "Maya: " : "User: "}
                          {lastMsg.content.substring(0, 80)}...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">No conversations found</p>
            )}
          </div>
        )}
      </div>
    </MobileAdminLayout>
  );
}
