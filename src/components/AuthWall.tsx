import { useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

export function AuthWall({
  title = "Login required",
  description = "Create a free account to save your progress and unlock this feature.",
}: {
  title?: string;
  description?: string;
}) {
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });

  return (
    <div className="p-6 sm:p-10 flex items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="size-12 rounded-xl bg-primary/10 text-primary grid place-items-center mx-auto mb-4">
          <Lock className="size-6" />
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-2">{description}</p>
        <div className="mt-6 space-y-2">
          <Button className="w-full" onClick={() => navigate({ to: "/login", search: { redirect: href } })}>
            Login
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => navigate({ to: "/signup", search: { redirect: href } })}>
            Create Account
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link to="/batches">Continue Browsing</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
