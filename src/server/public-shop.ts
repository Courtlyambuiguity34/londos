import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  shopSpecification,
  productReferences,
  type ShopSpecification,
} from "../modules/shop-design/specification";
import { transaction } from "./db/pool";
import { requireShop, type Actor } from "./security/authorization";
import { AccessError } from "./security/errors";
import { eligibilityJoins, eligibleStates } from "./public-eligibility";
import { contactInput } from "./contacts";
import {
  catalogueGeneration,
  encodeCatalogueCursor,
  decodeCatalogueCursor,
} from "./catalogue-pagination";

export type PublicDepartment = { id: string; name: string; slug: string };
export type PublicProduct = {
  id: string;
  department_id: string;
  name: string;
  slug: string;
  description: string;
  kind: "product" | "service";
  price_minor: string | null;
  currency: string;
  availability: string;
  position: number;
  media_id: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
};
export type PublicContact = {
  phone: string;
  whatsapp: string;
  website: string;
  fulfilment: string;
  payment_instructions: string;
  delivery_instructions: string;
  enquiries_enabled: boolean;
};
export type ShopView = {
  shop: {
    id: string;
    name: string;
    slug: string;
    tagline: string;
    version: number;
    category: string;
  };
  specification: ShopSpecification;
  revision: number;
  departments: PublicDepartment[];
  products: PublicProduct[];
  contact: PublicContact | null;
  privatePreview: boolean;
  applicationReviewed: boolean;
  selectedDepartment: PublicDepartment | null;
  selectedProduct: PublicProduct | null;
  missingDestination: boolean;
  nextCursor: string | null;
  paginated: boolean;
};
const productColumns =
  "q.id,q.department_id,q.name,q.slug,q.description,q.kind,q.price_minor::text,q.currency,q.availability,q.position,a.id AS media_id,a.alt,a.width,a.height";
const mediaJoin =
  "LEFT JOIN product_media pm ON pm.product_id=q.id LEFT JOIN media_assets a ON a.id=pm.asset_id AND a.state='ready' AND a.alt<>''";
const emptySpec: ShopSpecification = {
  schemaVersion: 1,
  theme: "earth",
  announcement: "",
  spaces: [],
  actions: [],
};
const routeKey = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(80);
export async function assemble(
  client: PoolClient,
  row: ShopView["shop"] & { design: unknown; revision: number },
  privatePreview: boolean,
  destination: { department?: string; product?: string; after?: string } = {},
): Promise<ShopView> {
  const specification = shopSpecification.safeParse(row.design).data ?? emptySpec;
  const departments = (
    await client.query(
      "SELECT id,name,slug FROM departments WHERE shop_id=$1 AND archived=false ORDER BY position,id LIMIT 100",
      [row.id],
    )
  ).rows as PublicDepartment[];
  const selectedDepartment = destination.department
    ? (departments.find(
        (d) => d.id === destination.department || d.slug === destination.department,
      ) ?? null)
    : null;
  const sources = specification.spaces.flatMap((s) =>
    s.type === "department" || s.type === "collection"
      ? [
          {
            id: s.departmentId,
            lim: s.limit,
            kind: s.type === "collection" ? s.kind : "all",
            availability: s.type === "collection" ? s.availability : "all",
          },
        ]
      : [],
  );
  const ids = productReferences(specification);
  let nextCursor: string | null = null;
  let products: PublicProduct[];
  if (destination.product)
    products = (
      await client.query(
        `SELECT ${productColumns} FROM products q JOIN departments d ON d.id=q.department_id ${mediaJoin} WHERE q.shop_id=$1 AND q.availability<>'archived' AND d.archived=false AND (q.slug=$2 OR q.id::text=$2) LIMIT 1`,
        [row.id, destination.product],
      )
    ).rows;
  else if (destination.department) {
    products = [];
    if (selectedDepartment) {
      const generation = await catalogueGeneration(client, row.id);
      const cursor = destination.after
        ? decodeCatalogueCursor(destination.after, row.id, selectedDepartment.id, generation)
        : null;
      const page = (
        await client.query(
          `SELECT ${productColumns} FROM products q ${mediaJoin} WHERE q.shop_id=$1 AND q.department_id=$2 AND q.availability<>'archived' AND ($3::integer IS NULL OR (q.position,q.id)>($3,$4::uuid)) ORDER BY q.position,q.id LIMIT 21`,
          [row.id, selectedDepartment.id, cursor?.position ?? null, cursor?.id ?? null],
        )
      ).rows as PublicProduct[];
      products = page.slice(0, 20);
      if (page.length > 20) {
        const last = products[products.length - 1]!;
        nextCursor = encodeCatalogueCursor(row.id, selectedDepartment.id, generation, {
          position: last.position,
          id: last.id,
        });
      }
    }
  } else
    products = (
      await client.query(
        `SELECT DISTINCT ON (q.id) ${productColumns} FROM (
    SELECT hit.* FROM jsonb_to_recordset($2::jsonb) AS source(id uuid,lim integer,kind text,availability text) CROSS JOIN LATERAL (SELECT * FROM products WHERE shop_id=$1 AND department_id=source.id AND availability<>'archived' AND (source.kind='all' OR kind=source.kind) AND (source.availability='all' OR availability=source.availability) ORDER BY position,id LIMIT source.lim) hit
    UNION ALL SELECT * FROM products WHERE shop_id=$1 AND id=ANY($3::uuid[]) AND availability<>'archived'
    ) q JOIN departments d ON d.id=q.department_id AND d.archived=false ${mediaJoin} ORDER BY q.id LIMIT 32`,
        [row.id, JSON.stringify(sources), ids],
      )
    ).rows;
  products.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const contactRow = (
    await client.query(
      "SELECT phone,whatsapp,website,fulfilment,payment_instructions,delivery_instructions,enquiries_enabled FROM shop_contacts WHERE shop_id=$1",
      [row.id],
    )
  ).rows[0] as PublicContact | undefined;
  let contact: PublicContact | null = null;
  if (contactRow) {
    const checked = contactInput.safeParse({
      phone: contactRow.phone,
      whatsapp: contactRow.whatsapp,
      website: contactRow.website,
      fulfilment: contactRow.fulfilment,
      paymentInstructions: contactRow.payment_instructions,
      deliveryInstructions: contactRow.delivery_instructions,
      enquiriesEnabled: contactRow.enquiries_enabled,
      version: 1,
      reason: "Public validation",
    });
    if (checked.success) contact = contactRow;
  }
  return {
    shop: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      tagline: row.tagline,
      version: row.version,
      category: row.category,
    },
    specification,
    revision: row.revision,
    departments,
    products,
    contact,
    privatePreview,
    applicationReviewed: Boolean(
      (
        await client.query(
          "SELECT 1 FROM applications a WHERE a.provisioned_shop_id=$1 AND a.state='approved' AND EXISTS(SELECT 1 FROM application_evidence e WHERE e.application_id=a.id)",
          [row.id],
        )
      ).rowCount,
    ),
    selectedDepartment,
    selectedProduct: destination.product ? (products[0] ?? null) : null,
    missingDestination: Boolean(
      (destination.product && !products[0]) || (destination.department && !selectedDepartment),
    ),
    nextCursor,
    paginated: Boolean(destination.after),
  };
}
export async function readPublicShop(
  pool: Pool,
  key: string,
  destination: { department?: string; product?: string; after?: string } = {},
) {
  if (
    !routeKey.safeParse(key).success ||
    [destination.department, destination.product].some(
      (value) => value !== undefined && !routeKey.safeParse(value).success,
    )
  )
    throw new AccessError(404, "resource_unavailable");
  if (
    destination.after !== undefined &&
    (!destination.department || !/^[A-Za-z0-9_-]{1,400}$/.test(destination.after))
  )
    throw new AccessError(422, "invalid_catalogue_cursor");
  return transaction(pool, async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await client.query("SET LOCAL statement_timeout='2000ms'");
    const row = (
      await client.query(
        `SELECT s.id,s.name,s.slug,s.tagline,s.version,s.category,r.design,r.revision FROM shops s ${eligibilityJoins} JOIN shop_designs sd ON sd.shop_id=s.id JOIN shop_revisions r ON r.id=sd.published_id AND r.shop_id=s.id WHERE (s.slug=$1 OR s.id::text=$1 OR EXISTS(SELECT 1 FROM shop_addresses sa WHERE sa.slug=$1 AND sa.shop_id=s.id)) AND ${eligibleStates} LIMIT 1`,
        [key],
      )
    ).rows[0];
    if (!row) throw new AccessError(404, "resource_unavailable");
    return assemble(client, row, false, destination);
  });
}
export async function readPrivatePreview(
  pool: Pool,
  actor: Actor,
  shopId: string,
  revision?: number,
) {
  await requireShop(pool, actor, shopId, "design");
  if (revision !== undefined) z.number().int().positive().parse(revision);
  return transaction(pool, async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await requireShop(client, actor, shopId, "design");
    const row = (
      await client.query(
        "SELECT s.id,s.name,s.slug,s.tagline,s.version,s.category,r.design,r.revision FROM shops s JOIN shop_designs sd ON sd.shop_id=s.id JOIN shop_revisions r ON r.shop_id=s.id AND (($2::integer IS NULL AND r.id=sd.draft_id) OR r.revision=$2) WHERE s.id=$1 LIMIT 1",
        [shopId, revision ?? null],
      )
    ).rows[0];
    if (!row) throw new AccessError(404, "resource_unavailable");
    return assemble(client, row, true);
  });
}
export async function readPublicVariant(
  pool: Pool,
  shopId: string,
  assetId: string,
  variant: string,
) {
  z.uuid().parse(shopId);
  z.uuid().parse(assetId);
  const name = z.enum(["thumbnail", "card", "display"]).parse(variant);
  const row = (
    await pool.query(
      `SELECT b.bytes FROM shops s ${eligibilityJoins} JOIN shop_designs sd ON sd.shop_id=s.id AND sd.published_id IS NOT NULL JOIN products q ON q.shop_id=s.id AND q.availability<>'archived' JOIN departments d ON d.id=q.department_id AND d.archived=false JOIN product_media pm ON pm.product_id=q.id JOIN media_assets a ON a.id=pm.asset_id AND a.shop_id=s.id AND a.state='ready' JOIN media_blobs b ON b.asset_id=a.id AND b.variant=$3 WHERE s.id=$1 AND a.id=$2 AND ${eligibleStates} LIMIT 1`,
      [shopId, assetId, name],
    )
  ).rows[0];
  if (!row) throw new AccessError(404, "resource_unavailable");
  return row.bytes as Buffer;
}
