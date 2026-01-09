import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { MayaVoiceCall } from '@/components/chat/MayaVoiceCall';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, Mic, MessageSquare, Plane, CreditCard, Search } from 'lucide-react';

/**
 * MAYA VOICE CALL PAGE
 * 
 * A dedicated page for voice conversations with Maya.
 * Uses ElevenLabs ONLY for voice (STT/TTS).
 * All intelligence comes from OUR ai-chat Maya with ALL tools.
 * 
 * Phone Maya = Website Maya = ONE MAYA!
 */

export default function VoiceCall() {
  return (
    <Layout>
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Talk to Maya</h1>
          <p className="text-muted-foreground">
            Voice conversation with your AI travel agent
          </p>
        </div>

        {/* Main voice call interface */}
        <Card className="mb-8">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Phone className="w-8 h-8 text-primary" />
            </div>
            <CardTitle>Voice Call with Maya</CardTitle>
            <CardDescription>
              Press the button to start, then hold the mic to speak
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MayaVoiceCall />
          </CardContent>
        </Card>

        {/* Maya's capabilities */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Plane className="w-4 h-4" />
                Flight Booking
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Book flights, check prices, submit ticket requests. Maya handles it all!
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="w-4 h-4" />
                Award Flights
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Search for award availability across 15+ mileage programs using your points.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Vouchers & Deals
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Find discounted airline vouchers and travel credits.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Full Support
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Check order status, get customer support, schedule callbacks.
            </CardContent>
          </Card>
        </div>

        {/* Info note */}
        <p className="text-xs text-center text-muted-foreground mt-8">
          This uses the same Maya AI as our chat - with full access to all booking tools, 
          database, and capabilities. Voice powered by ElevenLabs.
        </p>
      </div>
    </Layout>
  );
}
