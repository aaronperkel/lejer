import { ImageResponse } from "next/og";
import { Mark, ogFonts } from "@/lib/mark";

// The browser-tab icon, generated at build time (no binary to go stale when the name changes).
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  const { fonts, sans } = await ogFonts();
  return new ImageResponse(<Mark size={size.width} rounded font={sans} />, { ...size, fonts });
}
