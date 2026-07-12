import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/notes")({
  component: () => (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Extra Notes</h1>
      <p className="text-muted-foreground mt-2">Downloadable extra notes and study material will appear here.</p>
    </div>
  ),
});
