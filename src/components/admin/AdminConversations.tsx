import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MessageSquare, 
  Phone, 
  Globe, 
  RefreshCw, 
  Search, 
  User,
  Calendar,
  Clock,
  Mail,
  MessageCircle
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Message {
  role: string;
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  session_id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  channel: "web" | "whatsapp" | "voice";
  message_count: number;
  last_message: string | null;
  messages?: Message[];
}

interface CallLog {
  id: string;
  phone_number: string;
  airline: string;
  status: string;
  call_type: string | null;
  transcript: string | null;
  call_summary: string | null;
  duration_seconds: number | null;
  customer_email: string | null;
  customer_phone: string | null;
  created_at: string;
}

export function AdminConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | "web" | "whatsapp" | "voice">("all");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([fetchConversations(), fetchCallLogs()]);
    setLoading(false);
  };

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      // Fetch message counts for each conversation
      const conversationsWithCounts = await Promise.all(
        (data || []).map(async (conv) => {
          const { count } = await supabase
            .from("ai_chat_messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", conv.id);

          // Get the last message
          const { data: lastMsg } = await supabase
            .from("ai_chat_messages")
            .select("content, role")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          // Determine channel from session_id
          let channel: "web" | "whatsapp" | "voice" = "web";
          if (conv.session_id?.startsWith("whatsapp-")) {
            channel = "whatsapp";
          } else if (conv.session_id?.startsWith("el-") || conv.session_id?.startsWith("elevenlabs-")) {
            channel = "voice";
          }

          return {
            ...conv,
            channel,
            message_count: count || 0,
            last_message: lastMsg?.content?.substring(0, 100) || null,
          };
        })
      );

      setConversations(conversationsWithCounts);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      toast.error("Failed to fetch conversations");
    }
  };

  const fetchCallLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("call_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setCallLogs(data || []);
    } catch (error) {
      console.error("Error fetching call logs:", error);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from("ai_chat_messages")
        .select("role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("Error fetching messages:", error);
      toast.error("Failed to fetch messages");
    } finally {
      setLoadingMessages(false);
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "whatsapp":
        return <MessageSquare className="w-4 h-4 text-green-500" />;
      case "voice":
        return <Phone className="w-4 h-4 text-blue-500" />;
      default:
        return <Globe className="w-4 h-4 text-purple-500" />;
    }
  };

  const getChannelBadge = (channel: string) => {
    const colors = {
      web: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      whatsapp: "bg-green-500/20 text-green-400 border-green-500/30",
      voice: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    };
    return colors[channel as keyof typeof colors] || colors.web;
  };

  const filteredConversations = conversations.filter((conv) => {
    const matchesChannel = channelFilter === "all" || conv.channel === channelFilter;
    const matchesSearch =
      !searchQuery ||
      conv.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.customer_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.customer_phone?.includes(searchQuery) ||
      conv.session_id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesChannel && matchesSearch;
  });

  const stats = {
    total: conversations.length,
    web: conversations.filter((c) => c.channel === "web").length,
    whatsapp: conversations.filter((c) => c.channel === "whatsapp").length,
    voice: callLogs.length,
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <MessageCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Chats</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Globe className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.web}</p>
                <p className="text-xs text-muted-foreground">Web Chat</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <MessageSquare className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.whatsapp}</p>
                <p className="text-xs text-muted-foreground">WhatsApp</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Phone className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.voice}</p>
                <p className="text-xs text-muted-foreground">Voice Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card/50 border-border">
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by name, email, phone, or session..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={channelFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setChannelFilter("all")}
              >
                All
              </Button>
              <Button
                variant={channelFilter === "web" ? "default" : "outline"}
                size="sm"
                onClick={() => setChannelFilter("web")}
                className="gap-1"
              >
                <Globe className="w-4 h-4" /> Web
              </Button>
              <Button
                variant={channelFilter === "whatsapp" ? "default" : "outline"}
                size="sm"
                onClick={() => setChannelFilter("whatsapp")}
                className="gap-1"
              >
                <MessageSquare className="w-4 h-4" /> WhatsApp
              </Button>
              <Button
                variant={channelFilter === "voice" ? "default" : "outline"}
                size="sm"
                onClick={() => setChannelFilter("voice")}
                className="gap-1"
              >
                <Phone className="w-4 h-4" /> Voice
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAllData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Conversations List */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="text-lg">
            All Conversations ({filteredConversations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No conversations found</p>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {filteredConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedConversation(conv);
                      fetchMessages(conv.id);
                    }}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="flex-shrink-0">
                        {getChannelIcon(conv.channel)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {conv.customer_name || conv.customer_phone || conv.customer_email || "Anonymous"}
                          </span>
                          <Badge variant="outline" className={getChannelBadge(conv.channel)}>
                            {conv.channel}
                          </Badge>
                          {conv.message_count > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {conv.message_count} msgs
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate max-w-md">
                          {conv.last_message || "No messages"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground flex-shrink-0">
                      <div>{formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Conversation Detail Dialog */}
      <Dialog open={!!selectedConversation} onOpenChange={() => setSelectedConversation(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedConversation && getChannelIcon(selectedConversation.channel)}
              Conversation Details
            </DialogTitle>
          </DialogHeader>
          {selectedConversation && (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Customer Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span>{selectedConversation.customer_name || "Unknown"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span>{selectedConversation.customer_email || "-"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{selectedConversation.customer_phone || "-"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>{format(new Date(selectedConversation.created_at), "MMM d, yyyy")}</span>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 border rounded-lg p-4 bg-background/50">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No messages</p>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-2 ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          <p className="text-xs opacity-60 mt-1">
                            {format(new Date(msg.created_at), "h:mm a")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
