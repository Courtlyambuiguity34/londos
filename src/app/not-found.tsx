import { EmptyState } from "@/components/empty-state";

export default function NotFound() {
  return (
    <section className="shell page-section">
      <EmptyState
        title="This corner couldn’t be found."
        description="That shop or piece may not be available. There is plenty more to explore in the mall."
      />
    </section>
  );
}
