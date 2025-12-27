import { Layout } from "@/components/layout/Layout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  {
    question: "What are travel vouchers vs gift cards?",
    answer: "Travel vouchers are airline-issued credits typically from cancelled flights or compensation. Gift cards are prepaid cards that can be used like cash. Both can be used to book flights, but vouchers often have specific terms and expiration dates."
  },
  {
    question: "How do you verify voucher balances?",
    answer: "We verify every voucher balance directly with the airline through customer service calls, online balance checks, or official verification portals. Only vouchers with confirmed balances are listed for sale."
  },
  {
    question: "How long does delivery take?",
    answer: "Most vouchers are delivered within 24 hours via email. Some can be delivered within minutes. The specific delivery timeframe is shown on each voucher listing."
  },
  {
    question: "What's your refund policy?",
    answer: "If a voucher doesn't work as described, we offer a full refund. Please report any issues within 48 hours of delivery. Refunds are processed within 3-5 business days."
  },
  {
    question: "What if my flight is cancelled or changed?",
    answer: "Once the voucher is redeemed with the airline, their standard policies apply. We recommend purchasing travel insurance for protection against flight changes."
  },
  {
    question: "Can I pay with Bitcoin?",
    answer: "Yes! We accept Bitcoin payments. Simply select Bitcoin at checkout, send the exact amount to the provided address, and submit your transaction proof. We'll verify and process your order within a few hours."
  },
  {
    question: "How do ticket requests work?",
    answer: "Submit your travel details through our request form. Our agents will search for the best available options and send you a personalized quote within 24-48 hours. You only pay if you accept the quote."
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
