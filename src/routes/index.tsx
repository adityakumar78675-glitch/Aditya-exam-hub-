import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { GraduationCap, BookOpen, Video, FileText, Trophy } from "lucide-react";
import { HeroBanner } from "@/components/HeroBanner";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" />;

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto h-16 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">A</div>
            <span className="font-bold text-xl text-primary">Aditya Exam Hub</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/login"><Button variant="ghost">Login</Button></a>
            <a href="/signup"><Button>Get Started</Button></a>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 py-20 text-center">
        <span className="inline-block text-xs font-bold text-accent uppercase tracking-widest mb-4">India's Smart Exam Prep</span>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-foreground max-w-3xl mx-auto">
          Crack JEE, NEET & Boards with <span className="text-primary">India's top mentors</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Live classes, recorded lectures, DPPs, notes and full test series — all in one place. Built for Class 11, 12, JEE, NEET and Bihar Board aspirants.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href="/signup"><Button size="lg" className="text-base px-8">Start Learning Free</Button></a>
          <a href="/login"><Button size="lg" variant="outline" className="text-base px-8">I already have an account</Button></a>
        </div>

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 text-left">
          {[
            { icon: BookOpen, title: "Curated Batches", desc: "Structured courses for every target exam." },
            { icon: Video, title: "Live + Recorded", desc: "Never miss a class. Revise anytime." },
            { icon: FileText, title: "PDFs & Notes", desc: "Downloadable study material." },
            { icon: Trophy, title: "Test Series", desc: "Practice tests & progress tracking." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-card border border-border rounded-2xl p-5">
              <Icon className="size-6 text-primary mb-3" />
              <h3 className="font-bold">{title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-2">
          <GraduationCap className="size-4" />
          Aditya Exam Hub © {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
