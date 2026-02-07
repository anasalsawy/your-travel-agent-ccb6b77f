import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, Users, X, Plus, FileText } from "lucide-react";

interface EmailListUploaderProps {
  emails: string[];
  onEmailsChange: (emails: string[]) => void;
}

export function EmailListUploader({ emails, onEmailsChange }: EmailListUploaderProps) {
  const [manualEmail, setManualEmail] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".txt")) {
      toast.error("Please upload a .txt file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      // Support semicolon, comma, newline, and space separators
      const newEmails = text
        .split(/[;,\n\r\s]+/)
        .map((e) => e.trim())
        .filter((e) => e && e.includes("@") && e.includes("."));

      if (newEmails.length === 0) {
        toast.error("No valid email addresses found in file");
        return;
      }

      // Merge with existing, dedup
      const merged = Array.from(new Set([...emails, ...newEmails]));
      onEmailsChange(merged);
      toast.success(`Added ${newEmails.length} emails (${merged.length} total after dedup)`);
    };
    reader.readAsText(file);

    // Reset input so same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAddManual = () => {
    const trimmed = manualEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    if (emails.includes(trimmed)) {
      toast.warning("Email already in list");
      return;
    }
    onEmailsChange([...emails, trimmed]);
    setManualEmail("");
  };

  const handleRemoveEmail = (email: string) => {
    onEmailsChange(emails.filter((e) => e !== email));
  };

  const handleClearAll = () => {
    onEmailsChange([]);
    toast.info("Email list cleared");
  };

  const handleReplaceFromFile = () => {
    // This triggers file upload but replaces instead of merging
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const newEmails = text
          .split(/[;,\n\r\s]+/)
          .map((em) => em.trim())
          .filter((em) => em && em.includes("@") && em.includes("."));
        if (newEmails.length === 0) {
          toast.error("No valid emails found");
          return;
        }
        const deduped = Array.from(new Set(newEmails));
        onEmailsChange(deduped);
        toast.success(`Replaced list with ${deduped.length} emails`);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="w-5 h-5 text-primary" />
          Recipient List
        </CardTitle>
        <CardDescription>Upload a .txt file or add emails manually</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border border-border">
          <Users className="w-8 h-8 text-primary" />
          <div>
            <p className="text-2xl font-bold">{emails.length.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Email addresses loaded</p>
          </div>
        </div>

        {/* Upload buttons */}
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add from .txt
          </Button>
          <Button variant="outline" onClick={handleReplaceFromFile} className="gap-2">
            <Upload className="w-4 h-4" />
            Replace from .txt
          </Button>
          {emails.length > 0 && (
            <Button variant="ghost" onClick={handleClearAll} className="gap-2 text-destructive">
              <X className="w-4 h-4" />
              Clear All
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <FileText className="w-3 h-3" />
          Supported formats: emails separated by semicolons, commas, newlines, or spaces
        </p>

        {/* Manual add */}
        <div className="flex gap-2">
          <Input
            placeholder="Add email manually..."
            value={manualEmail}
            onChange={(e) => setManualEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddManual()}
          />
          <Button onClick={handleAddManual} size="sm" variant="secondary">
            Add
          </Button>
        </div>

        {/* Email list preview */}
        {emails.length > 0 && (
          <div className="max-h-48 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {emails.slice(0, 50).map((email, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="text-xs cursor-pointer hover:bg-destructive/20 group"
                  onClick={() => handleRemoveEmail(email)}
                >
                  {email}
                  <X className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Badge>
              ))}
              {emails.length > 50 && (
                <Badge variant="outline" className="text-xs">
                  +{emails.length - 50} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
