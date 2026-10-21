// Shared with the server: local URL only, no protocol-relative hosts, traversal
// segments, backslashes or percent-encoded escapes. Existing route shapes remain valid.
export function validCampaignPath(path: string): boolean {
  if (!/^\/(?!\/)[A-Za-z0-9/_?=&.-]{0,300}$/.test(path)) return false;
  return !path
    .split("?")[0]!
    .split("/")
    .some((part) => part === "." || part === "..");
}

export function campaignCtaError(label: string, path: string): string | null {
  if (!label && !path) return null;
  if (!label || !path) return "Add both a button label and a Londos path, or leave both empty.";
  if (label.length < 2 || label.length > 50 || /[\r\n]/.test(label))
    return "Use a button label of 2–50 characters on one line.";
  if (!validCampaignPath(path))
    return "Use a Londos path such as /shopkeeper, not an external URL, //host or a path containing .. segments.";
  return null;
}
