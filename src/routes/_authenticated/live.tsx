import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/live")({
  component: () => (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Live Classes</h1>
      <p className="text-muted-foreground mt-2">Live class scheduling is coming in the next phase.</p>
    </div>
  ),
});
