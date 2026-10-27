import { colorHex } from "../shop-design/presentation";
export function readableForeground(token: keyof typeof colorHex) {
  const hex = colorHex[token] ?? "#ffffff";
  const linear = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  return luminance > 0.179 ? "#151515" : "#ffffff";
}
