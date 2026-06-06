import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Home, BookOpen, Video, Trophy, User, LogOut, Shield, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({ component: AuthLayout });

function AuthLayout() {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading...</div>;
  }

  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: Home },
    { to: "/batches", label: "Browse Batches", icon: BookOpen },
    { to: "/live", label: "Live Classes", icon: Video },
    { to: "/tests", label: "Practice Tests", icon: Trophy },
    { to: "/profile", label: "Profile", icon: User },
  ];

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="w-64 border-r border-border bg-card flex flex-col sticky top-0 h-screen shrink-0 hidden md:flex">
        <div className="p-6">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">A</div>
            <span className="font-bold text-lg text-primary leading-tight">Exam Hub</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link key={to} to={to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}>
                <Icon className="size-4" /> {label}
              </Link>
            );
          })}
          {role === "admin" && (
            <Link to="/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith("/admin") ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}>
              <Shield className="size-4" /> Admin Panel
            </Link>
          )}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3 p-2">
            <div className="size-9 rounded-full bg-primary/10 text-primary grid place-items-center font-bold">
              {(user.email?.[0] ?? "U").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user.email}</p>
              <p className="text-[10px] uppercase text-muted-foreground">{role ?? "student"}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start mt-2" onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
            <LogOut className="size-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
