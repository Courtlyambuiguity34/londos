import { databaseBrowsing } from "@/server/preview";
import { publicMetadata } from "@/server/search-indexing";
import { CanonicalDirectory } from "@/components/canonical-directory";
import Link from "next/link";
import Image from "next/image";
import { categories } from "@/modules/catalogue/fixtures";
import { searchPreviewShops } from "@/modules/discovery/preview-directory";
import { SearchForm } from "@/components/search-form";
import { ShopCard } from "@/components/shop-card";
import { Icon } from "@/components/icon";

export function generateMetadata() {
  return publicMetadata(
    "/",
    "Londos — A place for good shops",
    "Discover independent shops, browse their products and services, and find your next favourite on Londos.",
  );
}

export default function MallEntrance() {
  if (databaseBrowsing()) return <CanonicalDirectory entrance />;
  const results = searchPreviewShops({ limit: 4 }).results;
  return (
    <>
      <section className="mall-hero shell">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" /> Your new favourite destination
          </p>
          <h1>
            Good shops.
            <br />
            All <em>together.</em>
          </h1>
          <p className="hero-description">
            Meet independent businesses with a world of their own. Discover a shop, step inside, and
            find your next favourite.
          </p>
          <SearchForm large />
          <p className="hero-hint">
            Looking for something? Try <Link href="/search?q=shoes">shoes</Link>,{" "}
            <Link href="/categories/home">a little home inspiration</Link>, or just wander.
          </p>
          <div className="hero-caption">
            <span className="hero-caption-line" /> A digital mall. A more personal way to explore.
          </div>
        </div>
        <div className="hero-art">
          <Image
            src="/illustrations/mall.svg"
            alt="An illustrated street of independent shops, gathered around a shared courtyard"
            width={740}
            height={650}
            priority
          />
          <div className="hero-art-note">
            <span className="note-circle">
              <Icon name="shop" />
            </span>
            <div>
              Every shop has a story.
              <br />
              <strong>Come find yours.</strong>
            </div>
          </div>
          <span className="hero-art-label">The Londos neighbourhood</span>
        </div>
      </section>
      <section className="category-strip">
        <div className="shell">
          <div className="section-kicker">
            <span>Find your corner of the mall</span>
            <span>Something for every day</span>
          </div>
          <nav aria-label="Shop categories" className="category-grid">
            {categories.map((category) => (
              <Link key={category.slug} href={`/categories/${category.slug}`}>
                <span className="category-symbol" aria-hidden="true">
                  {category.symbol}
                </span>
                <span>{category.name}</span>
                <Icon name="arrow" />
              </Link>
            ))}
          </nav>
        </div>
      </section>
      <section className="section shell">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Independent by nature</p>
            <h2>Shops worth stepping into.</h2>
          </div>
          <Link href="/search" className="text-link">
            Explore all shops <Icon name="arrow" />
          </Link>
        </div>
        <div className="shop-grid">
          {results.map((result) => (
            <ShopCard key={result.shop.id} result={result} />
          ))}
        </div>
      </section>
      <section className="how-it-works shell">
        <div className="how-heading">
          <p className="eyebrow">A mall, with a little more heart</p>
          <h2>
            A destination.
            <br />
            Not just a catalogue.
          </h2>
          <p>
            Find something you like, then get to know the shop behind it. There is always more to
            discover inside.
          </p>
        </div>
        <div className="how-steps">
          {[
            {
              number: "01",
              title: "Find your shop",
              text: "Follow a category, search for something, or let curiosity lead the way.",
            },
            {
              number: "02",
              title: "Step into their world",
              text: "Browse departments and collections, all in the shop’s own surroundings.",
            },
            {
              number: "03",
              title: "Make a connection",
              text: "When real shops open, contact the merchant through the methods they choose.",
            },
          ].map((step) => (
            <div className="how-step" key={step.number}>
              <span>{step.number}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="merchant-banner shell">
        <div>
          <p className="eyebrow">For the people behind good businesses</p>
          <h2>
            Your business deserves
            <br />a place of its own.
          </h2>
          <p>
            Bring your identity, your products, and your way of doing business. We’re building the
            destination around you.
          </p>
          <Link href="/rent-a-shop" className="button">
            Discover shop space <Icon name="arrow" />
          </Link>
        </div>
        <div className="merchant-banner-art" aria-hidden="true">
          <div className="sign-board">
            Your shop.
            <br />
            <em>Your world.</em>
            <span>IN LONDOS</span>
          </div>
          <span className="banner-spark">✦</span>
        </div>
      </section>
    </>
  );
}
