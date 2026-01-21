import React, { useState, useCallback } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Volume2, Mic } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * ELEVENLABS VOICE AGENT
 * 
 * Real-time voice conversation using ElevenLabs Conversational AI SDK.
 * Uses WebRTC for low-latency audio streaming.
 * 
 * The ElevenLabs agent is configured to call our elevenlabs-maya webhook,
 * which routes ALL intelligence through our ai-chat function.
 * 
 * This gives the voice agent full access to:
 * - Flight booking & ticket requests
 * - Award flight searches
 * - Voucher browsing & purchasing
 * - Order management
 * - Customer support
 * - And all 40+ Maya tools!
 */

export function ElevenLabsVoiceAgent() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const conversation = useConversation({
    onConnect: () => {
      console.log('Connected to ElevenLabs agent');
      toast.success('Connected! Start speaking with Maya.');
    },
    onDisconnect: () => {
      console.log('Disconnected from agent');
      toast.info('Call ended');
    },
    onMessage: (payload) => {
      // payload has: message, role ('user' | 'agent'), source (deprecated)
      console.log('Message received:', payload);
      
      if (payload.role === 'user') {
        setMessages(prev => [...prev, { role: 'user', content: payload.message }]);
      } else if (payload.role === 'agent') {
        setMessages(prev => [...prev, { role: 'assistant', content: payload.message }]);
      }
    },
    onError: (message, context) => {
      console.error('Conversation error:', message, context);
      toast.error('Connection error. Please try again.');
      setIsConnecting(false);
    },
  });

  const startConversation = useCallback(async () => {
    setIsConnecting(true);
    
    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get signed URL from our edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-conversation-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get conversation token');
      }

      const data = await response.json();
      
      if (!data.signed_url) {
        throw new Error('No signed URL received');
      }

      // Start the conversation with WebSocket (using signed URL)
      await conversation.startSession({
        signedUrl: data.signed_url,
      });

      setMessages([]);
      
    } catch (error) {
      console.error('Failed to start conversation:', error);
      toast.error('Could not connect. Please check microphone permissions.');
    } finally {
      setIsConnecting(false);
    }
  }, [conversation]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
    setMessages([]);
  }, [conversation]);

  const isConnected = conversation.status === 'connected';
  const isSpeaking = conversation.isSpeaking;

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      {/* Status indicator */}
      <div className="flex items-center gap-2 text-sm">
        <div className={`w-3 h-3 rounded-full transition-colors ${
          isConnected 
            ? isSpeaking 
              ? 'bg-green-500 animate-pulse' 
              : 'bg-green-500'
            : isConnecting
              ? 'bg-yellow-500 animate-pulse'
              : 'bg-muted'
        }`} />
        <span className="text-muted-foreground">
          {!isConnected && !isConnecting && "Ready to connect"}
          {isConnecting && "Connecting..."}
          {isConnected && !isSpeaking && "Listening..."}
          {isConnected && isSpeaking && "Maya is speaking..."}
        </span>
      </div>

      {/* Main call button */}
      {!isConnected ? (
        <Button 
          onClick={startConversation}
          disabled={isConnecting}
          size="lg"
          className="w-24 h-24 rounded-full bg-green-600 hover:bg-green-700 transition-transform hover:scale-105"
        >
          <Phone className="w-10 h-10" />
        </Button>
      ) : (
        <div className="flex items-center gap-6">
          {/* Speaking/Listening indicator */}
          <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
            isSpeaking 
              ? 'bg-green-500/20 border-2 border-green-500' 
              : 'bg-primary/20 border-2 border-primary animate-pulse'
          }`}>
            {isSpeaking ? (
              <Volume2 className="w-8 h-8 text-green-500 animate-pulse" />
            ) : (
              <Mic className="w-8 h-8 text-primary" />
            )}
          </div>
          
          {/* End call button */}
          <Button
            onClick={stopConversation}
            size="lg"
            variant="destructive"
            className="w-16 h-16 rounded-full"
          >
            <PhoneOff className="w-6 h-6" />
          </Button>
        </div>
      )}

      {/* Live status text */}
      {isConnected && (
        <p className="text-sm text-center text-muted-foreground max-w-xs">
          {isSpeaking 
            ? "Maya is responding..." 
            : "Speak naturally - Maya is listening with full access to bookings, flights, and support tools."
          }
        </p>
      )}

      {/* Conversation transcript */}
      {messages.length > 0 && (
        <div className="w-full max-w-md mt-4 space-y-3 max-h-60 overflow-y-auto">
          {messages.map((msg, i) => (
            <div 
              key={i}
              className={`p-3 rounded-lg text-sm ${
                msg.role === 'user' 
                  ? 'bg-primary/10 ml-8' 
                  : 'bg-muted mr-8'
              }`}
            >
              <span className="font-medium text-xs text-muted-foreground block mb-1">
                {msg.role === 'user' ? 'You' : 'Maya'}
              </span>
              {msg.content}
            </div>
          ))}
        </div>
      )}

      {/* Instructions */}
      {!isConnected && (
        <div className="text-center space-y-2 max-w-sm">
          <p className="text-sm text-muted-foreground">
            Press the button to start a real-time voice conversation with Maya.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Uses ElevenLabs for natural voice • Full access to all booking tools
          </p>
        </div>
      )}
    </div>
  );
}
