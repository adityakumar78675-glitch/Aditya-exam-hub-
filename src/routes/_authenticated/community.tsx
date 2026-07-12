import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/community")({
  component: () => (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Community</h1>
      <p className="text-muted-foreground mt-2">Discussion forums and community features are coming soon.</p>
    </div>
  ),
});
