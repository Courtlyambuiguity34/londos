import { databaseBrowsing } from "@/server/preview";
import { CanonicalDirectory } from "@/components/canonical-directory";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SearchForm } from "@/components/search-form";
import { ShopCard } from "@/components/shop-card";
import { EmptyState } from "@/components/empty-state";
import { findCategory, searchPreviewShops } from "@/modules/discovery/preview-directory";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: findCategory(slug)?.name ?? "Category not found" };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = findCategory(slug);
  if (!category) notFound();
  if (databaseBrowsing()) return <CanonicalDirectory category={category.slug} />;
  const results = searchPreviewShops({ category: category.slug }).results;
  return (
    <section className="shell page-section">
      <Breadcrumbs items={[{ label: "The mall", href: "/" }, { label: category.name }]} />
      <div className="category-page-heading">
        <div className="category-heading-symbol" aria-hidden="true">
          {category.symbol}
        </div>
        <div>
          <p className="eyebrow">Your corner of the mall</p>
          <h1>{category.name}</h1>
          <p>{category.description}</p>
        </div>
      </div>
      <div className="search-page-form">
        <SearchForm category={category.slug} />
      </div>
      <div className="results-heading">
        <p>
          {results.length} {results.length === 1 ? "shop" : "shops"} to explore
        </p>
        <span>Sample directory</span>
      </div>
      {results.length ? (
        <div className="shop-grid">
          {results.map((result) => (
            <ShopCard key={result.shop.id} result={result} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="More good shops are on the way."
          description="This corner of the preview has no open sample shops yet. There is more to discover in the rest of the mall."
        />
      )}
    </section>
  );
}
