import { useState, useRef, useCallback } from "react";

type VoiceChatState = "idle" | "recording" | "transcribing" | "processing" | "speaking";

interface UseVoiceChatOptions {
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceChat({ onTranscription, onError }: UseVoiceChatOptions = {}) {
  const [state, setState] = useState<VoiceChatState>("idle");
  const [isSupported, setIsSupported] = useState(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });

      // Try to use webm, fallback to other formats
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // Collect in 100ms chunks
      setState("recording");
    } catch (error) {
      console.error("Failed to start recording:", error);
      setIsSupported(false);
      onError?.("Microphone access denied or not available");
    }
  }, [onError]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        resolve(null);
        return;
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorder.mimeType 
        });
        
        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        resolve(audioBlob);
      };

      mediaRecorder.stop();
    });
  }, []);

  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    setState("transcribing");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-stt`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Transcription failed");
      }

      const data = await response.json();
      onTranscription?.(data.text);
      return data.text;
    } catch (error) {
      console.error("Transcription error:", error);
      onError?.("Failed to transcribe audio");
      setState("idle");
      return null;
    }
  }, [onTranscription, onError]);

  const speakText = useCallback(async (text: string): Promise<void> => {
    setState("speaking");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "TTS failed");
      }

      const data = await response.json();
      
      // Play the audio using data URI
      const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      return new Promise((resolve, reject) => {
        audio.onended = () => {
          setState("idle");
          resolve();
        };
        audio.onerror = () => {
          setState("idle");
          reject(new Error("Audio playback failed"));
        };
        audio.play().catch(reject);
      });
    } catch (error) {
      console.error("TTS error:", error);
      onError?.("Failed to generate speech");
      setState("idle");
    }
  }, [onError]);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setState("idle");
  }, []);

  const setProcessing = useCallback(() => {
    setState("processing");
  }, []);

  const setIdle = useCallback(() => {
    setState("idle");
  }, []);

  return {
    state,
    isSupported,
    isRecording: state === "recording",
    isTranscribing: state === "transcribing",
    isProcessing: state === "processing",
    isSpeaking: state === "speaking",
    startRecording,
    stopRecording,
    transcribeAudio,
    speakText,
    stopSpeaking,
    setProcessing,
    setIdle,
  };
}
