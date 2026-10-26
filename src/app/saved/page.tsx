import type { Metadata } from "next";
import { SavedShops } from "@/components/saved-shops";
export const metadata: Metadata = { title: "Saved shops", robots: { index: false, follow: false } };
export default function SavedPage() {
  return (
    <section className="shell page-section discovery-page">
      <div className="page-heading discovery-saved-heading">
        <p className="eyebrow">Your own little collection</p>
        <h1>
          Saved <em>shops.</em>
        </h1>
        <p>Find your favourites again, whenever you need them.</p>
      </div>
      <SavedShops />
    </section>
  );
}
