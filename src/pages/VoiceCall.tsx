import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { ElevenLabsVoiceAgent } from '@/components/voice/ElevenLabsVoiceAgent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, Plane, CreditCard, Search, MessageSquare, Zap } from 'lucide-react';

/**
 * VOICE CALL PAGE
 * 
 * Real-time voice conversation with Maya using ElevenLabs Conversational AI.
 * The agent has FULL access to all backend capabilities through the ai-chat function.
 */

export default function VoiceCall() {
  return (
    <Layout>
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-600 rounded-full text-sm mb-4">
            <Zap className="w-4 h-4" />
            Powered by ElevenLabs AI
          </div>
          <h1 className="text-3xl font-bold mb-2">Talk to Maya</h1>
          <p className="text-muted-foreground">
            Real-time voice conversation with your AI travel agent
          </p>
        </div>

        {/* Main voice call interface */}
        <Card className="mb-8 border-2">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
              <Phone className="w-8 h-8 text-white" />
            </div>
            <CardTitle>Voice Call</CardTitle>
            <CardDescription>
              Click to connect, then speak naturally
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ElevenLabsVoiceAgent />
          </CardContent>
        </Card>

        {/* Maya's capabilities */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-muted">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Plane className="w-4 h-4 text-primary" />
                Flight Booking
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Book flights, check prices, submit ticket requests. Full booking capabilities!
            </CardContent>
          </Card>

          <Card className="border-muted">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="w-4 h-4 text-primary" />
                Award Flights
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Search award availability across 15+ mileage programs using your points.
            </CardContent>
          </Card>

          <Card className="border-muted">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                Vouchers & Deals
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Find and purchase discounted airline vouchers and travel credits.
            </CardContent>
          </Card>

          <Card className="border-muted">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
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
          Maya has full access to all booking tools, database, and capabilities.
          Voice powered by ElevenLabs Conversational AI.
        </p>
      </div>
    </Layout>
  );
}
