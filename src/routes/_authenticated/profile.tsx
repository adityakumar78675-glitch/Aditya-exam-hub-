import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

function ProfilePage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ full_name: "", phone: "", class_level: "" });
  const [newPw, setNewPw] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name ?? "", phone: profile.phone ?? "", class_level: profile.class_level ?? "" });
  }, [profile]);

  async function save() {
    const { error } = await supabase.from("profiles").update(form).eq("id", user!.id);
    if (error) toast.error(error.message); else toast.success("Profile saved");
  }

  async function changePw() {
    if (newPw.length < 6) { toast.error("Min 6 characters"); return; }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) toast.error(error.message); else { toast.success("Password updated"); setNewPw(""); }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground text-sm">{user?.email}</p>
      </div>
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="font-bold">Personal details</h2>
        <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><Label>Class</Label><Input value={form.class_level} onChange={(e) => setForm({ ...form, class_level: e.target.value })} /></div>
        <Button onClick={save}>Save changes</Button>
      </div>
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="font-bold">Change password</h2>
        <div><Label>New password</Label><Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
        <Button onClick={changePw}>Update password</Button>
      </div>
    </div>
  );
}
