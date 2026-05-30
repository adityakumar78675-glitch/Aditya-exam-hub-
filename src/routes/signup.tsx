import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({ component: SignupPage });

const schema = z.object({
  fullName: z.string().trim().min(2, "Full name required").max(80),
  email: z.string().email("Enter a valid Gmail/email"),
  phone: z.string().trim().min(7, "Enter a valid phone").max(20),
  classLevel: z.string().min(1, "Select your class"),
  password: z.string().min(6, "Min 6 characters"),
});

const CLASSES = ["Class 11th", "Class 12th", "JEE", "NEET", "Bihar Board", "Dropper"];

function SignupPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", classLevel: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: form.fullName, phone: form.phone, class_level: form.classLevel },
      },
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Account created! Redirecting...");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-surface">
      <div className="hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-12">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary-foreground text-primary grid place-items-center font-bold">A</div>
          <span className="font-bold text-xl">Aditya Exam Hub</span>
        </Link>
        <div>
          <h2 className="text-4xl font-extrabold leading-tight">Begin your journey to success.</h2>
          <p className="mt-3 text-primary-foreground/80">Join thousands of students preparing for JEE, NEET and Boards with India's best mentors.</p>
        </div>
        <p className="text-xs text-primary-foreground/60">© Aditya Exam Hub</p>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
          <p className="text-sm text-muted-foreground mt-1">Free forever to get started.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="email">Gmail Address</Label>
              <Input id="email" type="email" placeholder="you@gmail.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="class">Class</Label>
                <Select value={form.classLevel} onValueChange={(v) => setForm({ ...form, classLevel: v })}>
                  <SelectTrigger id="class"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Min 6 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="text-sm text-center mt-6 text-muted-foreground">
            Already have an account? <Link to="/login" className="text-primary font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
