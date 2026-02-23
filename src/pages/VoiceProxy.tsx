import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, PhoneOff, Send, Mic, MicOff, Volume2 } from 'lucide-react';
import { toast } from 'sonner';

const VOICES = [
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger (Male, Warm)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Female, Soft)" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George (Male, British)" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura (Female, American)" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie (Male, Australian)" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice (Female, British)" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily (Female, British)" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel (Male, British)" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric (Male, American)" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam (Male, American)" },
];

interface CallState {
  status: 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';
  callSid: string | null;
  conferenceName: string | null;
  targetNumber: string;
}

interface SentMessage {
  text: string;
  timestamp: Date;
  status: 'sending' | 'played' | 'error';
}

export default function VoiceProxy() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [listenerPhone, setListenerPhone] = useState('');
  const [voiceId, setVoiceId] = useState("TX3LPaxmHKxFdv7VOQHJ");
  const [textInput, setTextInput] = useState('');
  const [callState, setCallState] = useState<CallState>({
    status: 'idle',
    callSid: null,
    conferenceName: null,
    targetNumber: '',
  });
  const [messages, setMessages] = useState<SentMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const statusPollRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll call status
  useEffect(() => {
    if (callState.status === 'calling' || callState.status === 'ringing' || callState.status === 'connected') {
      statusPollRef.current = window.setInterval(async () => {
        if (!callState.conferenceName) return;
        try {
          const res = await fetch(
            `${SUPABASE_URL}/functions/v1/voice-proxy-status?conference=${encodeURIComponent(callState.conferenceName)}`,
            { headers: { apikey: SUPABASE_KEY } }
          );
          const data = await res.json();
          
          if (data.status === 'in-progress' || data.status === 'answered') {
            setCallState(prev => ({ ...prev, status: 'connected' }));
          } else if (data.status === 'completed' || data.status === 'failed' || data.status === 'busy' || data.status === 'no-answer') {
            setCallState(prev => ({ ...prev, status: 'ended' }));
            toast.info(`Call ${data.status}`);
            if (statusPollRef.current) clearInterval(statusPollRef.current);
          }
        } catch { /* ignore polling errors */ }
      }, 2000);

      return () => {
        if (statusPollRef.current) clearInterval(statusPollRef.current);
      };
    }
  }, [callState.status, callState.conferenceName]);

  const startCall = useCallback(async () => {
    if (!phoneNumber.trim()) {
      toast.error('Enter a phone number');
      return;
    }

    setCallState({ status: 'calling', callSid: null, conferenceName: null, targetNumber: phoneNumber });

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/voice-proxy-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ phone_number: phoneNumber, listener_phone: listenerPhone || undefined }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to start call');

      setCallState({
        status: 'ringing',
        callSid: data.call_sid,
        conferenceName: data.conference_name,
        targetNumber: phoneNumber,
      });
      setMessages([]);
      toast.success(`Calling ${data.to}...`);
    } catch (err: any) {
      toast.error(err.message);
      setCallState(prev => ({ ...prev, status: 'idle' }));
    }
  }, [phoneNumber]);

  const endCall = useCallback(() => {
    // We can't easily hang up from here without Twilio REST, but the call will end
    // when the conference is empty or the other party hangs up
    setCallState({ status: 'idle', callSid: null, conferenceName: null, targetNumber: '' });
    setMessages([]);
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    toast.info('Call ended');
  }, []);

  const sendText = useCallback(async () => {
    if (!textInput.trim() || !callState.conferenceName || isSending) return;

    const text = textInput.trim();
    setTextInput('');
    setIsSending(true);

    const msgIndex = messages.length;
    setMessages(prev => [...prev, { text, timestamp: new Date(), status: 'sending' }]);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/voice-proxy-speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          text,
          voice_id: voiceId,
          conference_name: callState.conferenceName,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to speak');

      setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, status: 'played' } : m));
    } catch (err: any) {
      toast.error(err.message);
      setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, status: 'error' } : m));
    } finally {
      setIsSending(false);
    }
  }, [textInput, callState.conferenceName, voiceId, isSending, messages.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  };

  const isActive = callState.status === 'connected' || callState.status === 'ringing' || callState.status === 'calling';

  return (
    <Layout>
      <div className="container max-w-2xl mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Voice Proxy</h1>
          <p className="text-muted-foreground">
            Call anyone and speak through an AI-generated voice
          </p>
        </div>

        {/* Call Setup */}
        {callState.status === 'idle' || callState.status === 'ended' ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Start a Call</CardTitle>
              <CardDescription>Enter the phone number and choose your voice</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Phone Number</label>
                <Input
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Your Phone (to listen in)</label>
                <Input
                  type="tel"
                  placeholder="+1 (555) 987-6543"
                  value={listenerPhone}
                  onChange={(e) => setListenerPhone(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">Your phone will ring and join muted — you hear them, they don't hear you.</p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Voice</label>
                <Select value={voiceId} onValueChange={setVoiceId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICES.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={startCall} 
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
              >
                <Phone className="w-5 h-5 mr-2" />
                Start Call
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Active Call Header */}
            <Card className="mb-4 border-green-500/50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      callState.status === 'connected' ? 'bg-primary' : 'bg-accent animate-pulse'
                    }`} />
                    <div>
                      <p className="font-medium">{callState.targetNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {callState.status === 'calling' && 'Initiating...'}
                        {callState.status === 'ringing' && 'Ringing...'}
                        {callState.status === 'connected' && 'Connected'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={voiceId} onValueChange={setVoiceId}>
                      <SelectTrigger className="w-[180px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VOICES.map(v => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={endCall}
                      variant="destructive"
                      size="sm"
                    >
                      <PhoneOff className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Messages / Transcript */}
            <Card className="mb-4">
              <CardContent className="py-4">
                <div className="min-h-[200px] max-h-[400px] overflow-y-auto space-y-2">
                  {messages.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-8">
                      {callState.status === 'connected' 
                        ? "Type below to speak through your chosen voice..."
                        : "Waiting for the other party to pick up..."
                      }
                    </p>
                  ) : (
                    messages.map((msg, i) => (
                      <div key={i} className="flex items-start gap-2 ml-auto max-w-[80%] justify-end">
                        <div className={`px-3 py-2 rounded-lg text-sm ${
                          msg.status === 'error' 
                            ? 'bg-destructive/10 text-destructive' 
                            : msg.status === 'sending'
                              ? 'bg-muted opacity-70'
                              : 'bg-primary/10'
                        }`}>
                          <p>{msg.text}</p>
                          <span className="text-[10px] text-muted-foreground mt-1 block">
                            {msg.status === 'sending' && '⏳ Sending...'}
                            {msg.status === 'played' && '✓ Played'}
                            {msg.status === 'error' && '✗ Failed'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </CardContent>
            </Card>

            {/* Text Input */}
            <div className="flex gap-2">
              <Input
                placeholder={callState.status === 'connected' ? "Type what you want to say..." : "Waiting for connection..."}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={callState.status !== 'connected' || isSending}
                className="flex-1"
              />
              <Button
                onClick={sendText}
                disabled={callState.status !== 'connected' || !textInput.trim() || isSending}
                size="icon"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground mt-4">
              Type your message and press Enter. It will be spoken to the other party in your chosen voice.
              ~1 second delay between typing and playback.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
