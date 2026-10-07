import { ImageResponse } from "next/og";
import { Mark, ogFonts } from "@/lib/mark";

// Home-screen icon. Square and full-bleed: iOS rounds the corners itself.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const { fonts, sans } = await ogFonts();
  return new ImageResponse(<Mark size={size.width} rounded={false} font={sans} />, { ...size, fonts });
}
