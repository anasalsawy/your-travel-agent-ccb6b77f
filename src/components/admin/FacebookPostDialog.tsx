import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Facebook } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateFacebookPost } from "@/lib/facebook-post-generator";
import type { Tables } from "@/integrations/supabase/types";

type Voucher = Tables<"vouchers">;

interface FacebookPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher: Voucher | null;
}

export function FacebookPostDialog({ open, onOpenChange, voucher }: FacebookPostDialogProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  if (!voucher) return null;

  const postText = generateFacebookPost(voucher);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(postText);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Facebook post copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Facebook className="w-5 h-5 text-[#1877F2]" />
            Facebook Post for {voucher.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={postText}
            readOnly
            className="min-h-[280px] font-mono text-sm bg-muted/50 resize-none"
          />

          <Button onClick={handleCopy} className="w-full gap-2">
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy Facebook Post
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Copy this text and paste it into your Facebook post. Edit as needed before publishing.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
