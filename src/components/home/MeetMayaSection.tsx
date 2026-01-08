import { MessageSquare, Search, FileText, Bell, Brain, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";

const capabilities = [
  {
    icon: MessageSquare,
    title: "Sends Real SMS",
    description: "Notifies you instantly when agents respond to your request",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  {
    icon: Search,
    title: "Searches Flights",
    description: "Finds the best deals from verified travel agents in real-time",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    icon: FileText,
    title: "Creates Requests",
    description: "Builds detailed ticket requests and posts them for agents to bid",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  {
    icon: Bell,
    title: "Follows Up",
    description: "Tracks your requests and keeps you updated on new bids",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    icon: Brain,
    title: "Remembers You",
    description: "Learns your preferences to give personalized recommendations",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
  },
  {
    icon: Zap,
    title: "Takes Action",
    description: "Executes tasks on your behalf — not just suggestions",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
];

export function MeetMayaSection() {
  return (
    <section className="py-20 bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            AI-Powered
          </div>
          <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
            Meet Maya
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Not a chatbot. <span className="text-foreground font-semibold">Your travel assistant.</span>
            <br />
            Maya doesn't just answer questions — she gets things done.
          </p>
        </div>

        {/* Capabilities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {capabilities.map((capability, index) => (
            <Card
              key={capability.title}
              className="group relative p-6 border-border/50 bg-card/50 backdrop-blur-sm hover:bg-card hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Animated Icon */}
              <div className={`${capability.bgColor} ${capability.color} w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                <capability.icon className="w-7 h-7 group-hover:animate-pulse" />
              </div>

              {/* Content */}
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {capability.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {capability.description}
              </p>

              {/* Hover indicator */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Card>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12">
          <p className="text-muted-foreground mb-4">
            Ready to experience the difference?
          </p>
          <a
            href="/chat"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors group"
          >
            <MessageSquare className="w-5 h-5" />
            Chat with Maya
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
