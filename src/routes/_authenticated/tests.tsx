import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/tests")({
  component: () => (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Practice Tests</h1>
      <p className="text-muted-foreground mt-2">Test series will be available in the next phase.</p>
    </div>
  ),
});
