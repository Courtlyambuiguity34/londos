export type CategorySlug = "fashion" | "electronics" | "beauty" | "food" | "home" | "services";

export interface Category {
  readonly slug: CategorySlug;
  readonly name: string;
  readonly description: string;
  readonly symbol: string;
}

export interface Department {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
}

export interface PreviewShop {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly category: CategorySlug;
  readonly location: string;
  readonly colour: "clay" | "olive" | "blue" | "plum" | "gold" | "rose";
  readonly illustration: "fashion" | "electronics" | "beauty" | "food" | "home" | "services";
  readonly initials: string;
  readonly departments: readonly Department[];
  readonly previewState: "open" | "closed" | "suspended";
  readonly featured: boolean;
}

export interface PreviewProduct {
  readonly id: string;
  readonly slug: string;
  readonly shopId: string;
  readonly departmentSlug: string;
  readonly name: string;
  readonly description: string;
  readonly priceUgx: number | null;
  readonly priceNote: string | null;
  readonly art:
    | "dress"
    | "shoe"
    | "bag"
    | "headphones"
    | "speaker"
    | "serum"
    | "bowl"
    | "lamp"
    | "plant"
    | "service";
  readonly tags: readonly string[];
  readonly kind: "product" | "service";
}
