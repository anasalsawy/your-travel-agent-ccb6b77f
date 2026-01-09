import { Mic, MicOff, Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VoiceState = "idle" | "recording" | "transcribing" | "processing" | "speaking";

interface VoiceButtonProps {
  state: VoiceState;
  onPress: () => void;
  onRelease: () => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceButton({ state, onPress, onRelease, disabled, className }: VoiceButtonProps) {
  const isRecording = state === "recording";
  const isTranscribing = state === "transcribing";
  const isProcessing = state === "processing";
  const isSpeaking = state === "speaking";
  const isLoading = isTranscribing || isProcessing;

  return (
    <Button
      type="button"
      size="icon"
      variant={isRecording ? "destructive" : "outline"}
      disabled={disabled || isLoading || isSpeaking}
      onMouseDown={onPress}
      onMouseUp={onRelease}
      onMouseLeave={isRecording ? onRelease : undefined}
      onTouchStart={onPress}
      onTouchEnd={onRelease}
      className={cn(
        "rounded-full shrink-0 transition-all duration-200",
        isRecording && "animate-pulse scale-110 bg-red-500 hover:bg-red-600",
        isSpeaking && "bg-primary/20",
        className
      )}
      aria-label={isRecording ? "Release to send" : "Hold to speak"}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isSpeaking ? (
        <Volume2 className="h-4 w-4 animate-pulse" />
      ) : isRecording ? (
        <MicOff className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}
