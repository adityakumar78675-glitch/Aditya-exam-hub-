import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Home, BookOpen, Video, Trophy, User, LogOut, Shield, Menu, X, Users, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MasterJiFloatingButton } from "@/components/MasterJi";
import { NotificationBell } from "@/components/NotificationBell";
import { ensurePushOnLogin } from "@/lib/push-client";

export const Route = createFileRoute("/_authenticated")({ component: AuthLayout });

function AuthLayout() {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading...</div>;
  }

  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: Home },
    { to: "/batches", label: "Browse Batches", icon: BookOpen },
    { to: "/live", label: "Live Classes", icon: Video },
    { to: "/tests", label: "Practice Tests", icon: Trophy },
    { to: "/community", label: "Community", icon: Users },
    { to: "/notes", label: "Extra Notes", icon: FileText },
    { to: "/profile", label: "Profile", icon: User },
  ];

  const SidebarInner = (
    <>
      <div className="p-6 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">A</div>
          <span className="font-bold text-lg text-primary leading-tight">Exam Hub</span>
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          className="md:hidden -mr-2 p-2 rounded-lg text-muted-foreground hover:bg-muted"
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
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
    </>
  );

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Desktop sidebar (collapsible) */}
      <aside
        className={`hidden md:flex border-r border-border bg-card flex-col sticky top-0 h-screen shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden ${
          menuOpen ? "w-0 border-r-0" : "w-64"
        }`}
      >
        <div className="w-64 flex flex-col h-full">{SidebarInner}</div>
      </aside>

      {/* Mobile drawer overlay */}
      <div
        onClick={() => setMenuOpen(false)}
        className={`md:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />
      {/* Mobile drawer */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border flex flex-col transition-transform duration-300 ease-in-out ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {SidebarInner}
      </aside>

      <main className="flex-1 min-w-0">
        {/* Top bar with hamburger toggle */}
        <div className="sticky top-0 z-30 h-12 flex items-center px-2 bg-card/80 backdrop-blur border-b border-border">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-2 rounded-lg text-foreground hover:bg-muted transition-colors"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        <Outlet />
      </main>
      <MasterJiFloatingButton />
    </div>
  );
}
