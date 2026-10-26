import type { ShopSpecification, ShopSpace } from "../shop-design/specification";
function key(space: ShopSpace) {
  const value = { ...space } as Record<string, unknown>;
  delete value.id;
  return JSON.stringify(value);
}
export function distinctShopSections(spaces: ShopSpace[]) {
  const found = new Set<string>();
  return spaces.filter((space) => {
    const id = key(space);
    if (found.has(id)) return false;
    found.add(id);
    return true;
  });
}
export function starterSections(
  departments: { id: string; name: string }[],
): ShopSpecification["spaces"] {
  return departments.slice(0, 4).map((department, index) => ({
    id: `collection-${index + 1}`,
    type: "department",
    version: 1,
    departmentId: department.id,
    limit: 8,
  }));
}
