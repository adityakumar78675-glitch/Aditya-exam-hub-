import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { sendBroadcast } from "@/lib/push.functions";
import { Send } from "lucide-react";

const TYPES: Array<{ v: "new_lecture" | "live_class" | "new_pdf" | "extra_notes" | "community" | "master_ji" | "test_series" | "assignment" | "general"; label: string }> = [
  { v: "general", label: "General Announcement" },
  { v: "new_lecture", label: "New Lecture" },
  { v: "live_class", label: "Live Class" },
  { v: "new_pdf", label: "New PDF" },
  { v: "extra_notes", label: "Extra Notes" },
  { v: "community", label: "Community" },
  { v: "master_ji", label: "Master Ji AI Update" },
  { v: "test_series", label: "Test Series" },
  { v: "assignment", label: "Assignment" },
];

export function NotificationsAdmin() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["v"]>("general");

  const mut = useMutation({
    mutationFn: () =>
      sendBroadcast({
        data: {
          title,
          body,
          imageUrl: imageUrl.trim() || null,
          redirectUrl: redirectUrl.trim() || null,
          buttonText: buttonText.trim() || null,
          type,
          targetType: "all_students",
        },
      }),
    onSuccess: (res) => {
      toast.success(
        `Sent to ${res.recipients} students (${res.sent} push delivered${res.failed ? `, ${res.failed} failed` : ""}).`,
      );
      setTitle("");
      setBody("");
      setImageUrl("");
      setRedirectUrl("");
      setButtonText("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold">Send a notification</h2>
        <p className="text-sm text-muted-foreground">
          Broadcast to all students. Sends both an in-app bell notification and a browser push (for
          students who allowed notifications).
        </p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div>
          <Label>Title</Label>
          <Input
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New Physics lecture just dropped 🎉"
          />
        </div>
        <div>
          <Label>Message</Label>
          <Textarea
            value={body}
            maxLength={500}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Details of the announcement..."
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Redirect page (optional)</Label>
            <Input
              value={redirectUrl}
              onChange={(e) => setRedirectUrl(e.target.value)}
              placeholder="/dashboard"
            />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Banner image URL (optional)</Label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label>Button text (optional)</Label>
            <Input
              value={buttonText}
              maxLength={40}
              onChange={(e) => setButtonText(e.target.value)}
              placeholder="Open"
            />
          </div>
        </div>
        <Button
          disabled={!title.trim() || !body.trim() || mut.isPending}
          onClick={() => mut.mutate()}
        >
          <Send className="size-4 mr-2" />
          {mut.isPending ? "Sending..." : "Send to all students"}
        </Button>
      </div>
    </div>
  );
}
