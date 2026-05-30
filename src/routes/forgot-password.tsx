import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPage });

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
    toast.success("Check your inbox for a reset link.");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-surface p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8">
        <h1 className="text-2xl font-bold tracking-tight">Forgot password</h1>
        <p className="text-sm text-muted-foreground mt-1">We'll email you a reset link.</p>

        {sent ? (
          <div className="mt-6 p-4 bg-accent/10 border border-accent/20 rounded-lg text-sm">
            If an account exists, a reset link has been sent to <strong>{email}</strong>.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        )}

        <p className="text-sm text-center mt-6 text-muted-foreground">
          <Link to="/login" className="text-primary font-semibold hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
