import { Layout } from "@/components/layout/Layout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  {
    question: "What services do you offer?",
    answer: "We're a personal travel concierge. We find discounted flight tickets and rental cars for you, handle the booking from start to finish, and guarantee the lowest price — if you find a better deal elsewhere, we'll beat it."
  },
  {
    question: "How does the flight quote process work?",
    answer: "Submit your travel details through our request form. Our agents will search for the best available options and send you a personalized quote within 24-48 hours. You only pay if you accept the quote."
  },
  {
    question: "How long does it take to get a quote?",
    answer: "Most quotes are sent within 24 hours. Urgent or last-minute trips can usually be handled faster — just let us know in your request."
  },
  {
    question: "What's your refund policy?",
    answer: "Refund eligibility depends on the airline or rental supplier's fare rules. Before ticketing or booking, you can cancel for a full refund minus any processing fees. After ticketing, standard airline policies apply."
  },
  {
    question: "What if my flight is cancelled or changed?",
    answer: "Once a ticket is issued, the airline's standard policies apply. We recommend travel insurance for protection against schedule changes and we're happy to help you re-book through the airline."
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept credit/debit cards, PayPal, bank transfer, and Bitcoin. For extra protection on larger transactions, you can also pay through Escrow.com."
  },
  {
    question: "Do you handle car rentals worldwide?",
    answer: "Yes. Tell us your pickup city, dates, and car preferences and we'll find the best rental deal available — from compact city cars to luxury SUVs."
  },
];

export default function FAQPage() {
  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                Frequently Asked <span className="text-gradient">Questions</span>
              </h1>
              <p className="text-muted-foreground">Everything you need to know about our services</p>
            </div>

            <div className="glass-card p-6 md:p-8">
              <Accordion type="single" collapsible className="space-y-2">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`} className="border-border">
                    <AccordionTrigger className="text-left font-semibold hover:text-primary">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
