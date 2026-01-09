import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * MAYA VOICE CALL COMPONENT
 * 
 * This component enables voice conversations with Maya using:
 * - ElevenLabs for STT (Speech-to-Text) and TTS (Text-to-Speech)
 * - OUR ai-chat function for ALL intelligence and tools
 * 
 * Phone Maya = Website Maya = ONE MAYA!
 * 
 * Flow:
 * 1. User clicks and holds to record → captures audio
 * 2. Audio sent to maya-voice-conversation → STT → ai-chat → TTS
 * 3. Maya's audio response plays back
 */

export function MayaVoiceCall() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string>('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start a voice call session
  const startCall = useCallback(async () => {
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      setIsConnected(true);
      setConversationId(crypto.randomUUID());
      setMessages([]);
      
      toast.success("Connected! Hold the mic button to speak with Maya.");
      
      // Play greeting
      await speak("Hey! This is Maya from Your Travel Agent. How can I help you today?");
      
    } catch (error) {
      console.error("Failed to start call:", error);
      toast.error("Could not access microphone. Please allow microphone access.");
    }
  }, []);

  // End the call
  const endCall = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    setIsConnected(false);
    setIsRecording(false);
    setIsSpeaking(false);
    setMessages([]);
    
    toast.info("Call ended. Talk to you later!");
  }, []);

  // Convert text to speech using ElevenLabs
  const speak = async (text: string) => {
    setIsSpeaking(true);
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) throw new Error("TTS failed");

      const data = await response.json();
      const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
      
      await audio.play();
      
    } catch (error) {
      console.error("TTS error:", error);
      setIsSpeaking(false);
    }
  };

  // Start recording
  const startRecording = useCallback(async () => {
    if (!streamRef.current || isProcessing || isSpeaking) return;
    
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      setIsSpeaking(false);
    }
    
    audioChunksRef.current = [];
    
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };
    
    mediaRecorder.start(100); // Collect data every 100ms
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
  }, [isProcessing, isSpeaking]);

  // Stop recording and process
  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    
    setIsRecording(false);
    setIsProcessing(true);
    
    // Stop the media recorder
    mediaRecorderRef.current.stop();
    
    // Wait for final data
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (audioChunksRef.current.length === 0) {
      setIsProcessing(false);
      return;
    }
    
    // Create audio blob
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    
    try {
      // Send to maya-voice-conversation (STT → ai-chat → TTS)
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('session_id', conversationId);
      formData.append('conversation_id', conversationId);
      formData.append('history', JSON.stringify(messages));
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/maya-voice-conversation`,
        {
          method: "POST",
          headers: {
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) throw new Error("Voice conversation failed");

      const data = await response.json();
      
      // Update messages
      if (data.user_text) {
        setMessages(prev => [...prev, { role: 'user', content: data.user_text }]);
      }
      if (data.maya_text) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.maya_text }]);
      }
      
      // Update conversation ID if changed
      if (data.conversation_id) {
        setConversationId(data.conversation_id);
      }
      
      // Play Maya's audio response
      if (data.audio) {
        setIsSpeaking(true);
        const audioUrl = `data:audio/mpeg;base64,${data.audio}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        
        audio.onended = () => setIsSpeaking(false);
        audio.onerror = () => setIsSpeaking(false);
        
        await audio.play();
      }
      
    } catch (error) {
      console.error("Voice conversation error:", error);
      toast.error("Something went wrong. Try again!");
      await speak("Hmm, I didn't quite catch that. Can you try again?");
    } finally {
      setIsProcessing(false);
    }
  }, [isRecording, conversationId, messages]);

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      {/* Status indicator */}
      <div className="flex items-center gap-2 text-sm">
        <div className={`w-2 h-2 rounded-full ${
          isConnected 
            ? isSpeaking 
              ? 'bg-green-500 animate-pulse' 
              : isRecording 
                ? 'bg-red-500 animate-pulse'
                : 'bg-green-500' 
            : 'bg-muted'
        }`} />
        <span className="text-muted-foreground">
          {!isConnected && "Ready to connect"}
          {isConnected && !isRecording && !isProcessing && !isSpeaking && "Listening... Hold mic to speak"}
          {isRecording && "Recording..."}
          {isProcessing && "Processing..."}
          {isSpeaking && "Maya is speaking..."}
        </span>
      </div>

      {/* Main call button */}
      {!isConnected ? (
        <Button 
          onClick={startCall}
          size="lg"
          className="w-20 h-20 rounded-full bg-green-600 hover:bg-green-700"
        >
          <Phone className="w-8 h-8" />
        </Button>
      ) : (
        <div className="flex items-center gap-4">
          {/* Mic button - hold to speak */}
          <Button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={isProcessing || isSpeaking}
            size="lg"
            variant={isRecording ? "destructive" : "default"}
            className={`w-16 h-16 rounded-full transition-all ${
              isRecording ? 'scale-110' : ''
            }`}
          >
            {isRecording ? (
              <MicOff className="w-6 h-6" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </Button>
          
          {/* End call button */}
          <Button
            onClick={endCall}
            size="lg"
            variant="destructive"
            className="w-16 h-16 rounded-full"
          >
            <PhoneOff className="w-6 h-6" />
          </Button>
        </div>
      )}

      {/* Volume indicator when speaking */}
      {isSpeaking && (
        <div className="flex items-center gap-2 text-green-500">
          <Volume2 className="w-5 h-5 animate-pulse" />
          <span className="text-sm">Maya is speaking...</span>
        </div>
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
      {isConnected && (
        <p className="text-xs text-muted-foreground text-center max-w-xs">
          Hold the mic button to speak. Release to send your message to Maya.
          Maya has full access to bookings, vouchers, award flights, and more!
        </p>
      )}
    </div>
  );
}
