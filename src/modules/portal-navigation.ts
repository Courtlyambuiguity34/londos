export function activePortalHref(path: string, destinations: string[]) {
  return destinations
    .filter(
      (href) =>
        path === href ||
        (href !== "/shopkeeper" && href !== "/landlord" && path.startsWith(`${href}/`)),
    )
    .sort((a, b) => b.length - a.length)[0];
}
