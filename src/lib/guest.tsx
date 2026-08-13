import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { LogIn, UserPlus, Lock } from "lucide-react";

type GateCtx = {
  /** Show the "Login required" popup. */
  promptLogin: (feature?: string) => void;
  /** Returns true when signed in; otherwise shows the popup and returns false. */
  requireAuth: (feature?: string) => boolean;
  isGuest: boolean;
};

const Ctx = createContext<GateCtx | undefined>(undefined);

export function LoginGateProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });
  const [open, setOpen] = useState(false);
  const [feature, setFeature] = useState<string | undefined>();

  const promptLogin = useCallback((f?: string) => {
    setFeature(f);
    setOpen(true);
  }, []);

  const requireAuth = useCallback(
    (f?: string) => {
      if (user) return true;
      if (!loading) promptLogin(f);
      return false;
    },
    [user, loading, promptLogin],
  );

  const go = (to: "/login" | "/signup") => {
    setOpen(false);
    navigate({ to, search: { redirect: href } });
  };

  return (
    <Ctx.Provider value={{ promptLogin, requireAuth, isGuest: !user }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center mb-2">
              <Lock className="size-5" />
            </div>
            <DialogTitle>Login required</DialogTitle>
            <DialogDescription>
              {feature ? `${feature} needs an account. ` : ""}
              Create a free account to save your progress and unlock this feature.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button className="w-full" onClick={() => go("/login")}>
              <LogIn className="size-4 mr-2" /> Login
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => go("/signup")}>
              <UserPlus className="size-4 mr-2" /> Create Account
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>
              Continue Browsing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useLoginGate() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLoginGate must be used inside LoginGateProvider");
  return ctx;
}

/** Only allow same-origin relative paths as post-login destinations. */
export function safeRedirect(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
