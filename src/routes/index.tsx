import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { HeroBanner } from "@/components/HeroBanner";
import {
  GraduationCap,
  BookOpen,
  Video,
  FileText,
  Trophy,
  Users,
  Bot,
  ArrowRight,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Aditya Exam Hub — JEE, NEET & Board Exam Prep Online" },
      {
        name: "description",
        content:
          "Free live classes, recorded lectures, notes, test series and the Master Ji AI tutor for JEE, NEET, Class 11-12 and Bihar Board students.",
      },
      { property: "og:title", content: "Aditya Exam Hub — JEE, NEET & Board Exam Prep Online" },
      {
        property: "og:description",
        content:
          "Explore batches, lectures and test series for free. Sign in only when you want to save progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Batch = {
  id: string;
  title: string;
  description: string | null;
  class_level: string | null;
  thumbnail_url: string | null;
  price: number | null;
  discount_price: number | null;
};

function Landing() {
  const { user, role } = useAuth();

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["public-batches"],
    queryFn: async () => {
      const { data } = await supabase
        .from("batches")
        .select("id, title, description, class_level, thumbnail_url, price, discount_price")
        .order("created_at", { ascending: false })
        .limit(6);
      return (data ?? []) as Batch[];
    },
  });

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">
              A
            </div>
            <span className="font-bold text-lg sm:text-xl text-primary">Aditya Exam Hub</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <Button asChild variant="ghost"><Link to="/batches">Batches</Link></Button>
            <Button asChild variant="ghost"><Link to="/tests">Test Series</Link></Button>
            <Button asChild variant="ghost"><Link to="/live">Live</Link></Button>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild>
                <Link to={role === "admin" ? "/admin" : "/dashboard"}>
                  {role === "admin" ? "Admin Panel" : "My Dashboard"}
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost"><Link to="/login">Login</Link></Button>
                <Button asChild><Link to="/signup">Get Started</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 md:px-6 pt-6">
        <HeroBanner />
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-10 text-center">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-widest mb-4">
          <Sparkles className="size-4" /> India's Smart Exam Prep
        </span>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground max-w-4xl mx-auto leading-tight">
          Crack JEE, NEET &amp; Boards with <span className="text-primary">India's top mentors</span>
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
          Browse batches, lectures and test series for free — no login needed. Create an account only when
          you want to save your progress.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="text-base px-8">
            <Link to="/batches">Explore Batches</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="text-base px-8">
            <Link to="/tests">Try a Free Test</Link>
          </Button>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Explore learning</h2>
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[
            { icon: BookOpen, title: "Batches", desc: "Structured courses for every target exam.", to: "/batches" as const },
            { icon: Video, title: "Live Classes", desc: "Join live sessions and never miss a class.", to: "/live" as const },
            { icon: Trophy, title: "Test Series", desc: "Real exam interface with instant results.", to: "/tests" as const },
            { icon: FileText, title: "Notes & PDFs", desc: "Downloadable notes and study material.", to: "/notes" as const },
          ].map(({ icon: Icon, title, desc, to }) => (
            <Link
              key={title}
              to={to}
              className="group bg-card border border-border rounded-2xl p-5 hover:border-primary/50 hover:shadow-md transition"
            >
              <Icon className="size-6 text-primary mb-3" />
              <h3 className="font-bold flex items-center gap-1">
                {title}
                <ArrowRight className="size-4 opacity-0 group-hover:opacity-100 transition" />
              </h3>
              <p className="text-sm text-muted-foreground mt-1">{desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Popular batches</h2>
            <p className="text-sm text-muted-foreground mt-1">Handpicked courses running right now.</p>
          </div>
          <Button asChild variant="ghost" className="shrink-0">
            <Link to="/batches">View all <ArrowRight className="size-4 ml-1" /></Link>
          </Button>
        </div>

        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)
            : batches.map((b) => {
                const free = !(b.discount_price ?? b.price ?? 0);
                return (
                  <Link
                    key={b.id}
                    to="/batches/$batchId"
                    params={{ batchId: b.id }}
                    className="group bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary/40 transition"
                  >
                    <div className="aspect-video bg-gradient-to-br from-primary/15 to-accent/15 relative">
                      {b.thumbnail_url ? (
                        <img
                          src={b.thumbnail_url}
                          alt={`${b.title} batch cover`}
                          loading="lazy"
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : (
                        <GraduationCap className="size-10 text-primary absolute inset-0 m-auto" />
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {b.class_level && <Badge variant="secondary">{b.class_level}</Badge>}
                        {free && <Badge>Free</Badge>}
                      </div>
                      <h3 className="font-bold group-hover:text-primary transition line-clamp-1">{b.title}</h3>
                      {b.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{b.description}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
          {!isLoading && batches.length === 0 && (
            <p className="text-muted-foreground text-sm">New batches are coming soon.</p>
          )}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="rounded-3xl bg-primary text-primary-foreground p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-80">
              <Bot className="size-4" /> AI Tutor
            </span>
            <h2 className="mt-3 text-3xl md:text-4xl font-extrabold leading-tight">
              Meet Master Ji, your 24×7 study partner
            </h2>
            <p className="mt-3 text-primary-foreground/80">
              Ask doubts in Hindi, English or Hinglish. Get step-by-step solutions, diagrams, notes and
              MCQs generated instantly — even from a photo of your question.
            </p>
            <Button asChild size="lg" variant="secondary" className="mt-6">
              <Link to="/signup">Ask your first doubt free</Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Sparkles, t: "Instant solutions" },
              { icon: FileText, t: "Notes & summaries" },
              { icon: Users, t: "Doubt community" },
              { icon: ShieldCheck, t: "Exam-focused" },
            ].map(({ icon: Icon, t }) => (
              <div key={t} className="rounded-2xl bg-primary-foreground/10 p-4">
                <Icon className="size-5 mb-2" />
                <p className="font-semibold text-sm">{t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {!user && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14 text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Ready to start preparing?</h2>
          <p className="mt-2 text-muted-foreground">Free to join. No payment required.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg"><Link to="/signup">Create free account</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/login">I already have an account</Link></Button>
          </div>
        </section>
      )}

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-2">
          <GraduationCap className="size-4" />
          Aditya Exam Hub © {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
