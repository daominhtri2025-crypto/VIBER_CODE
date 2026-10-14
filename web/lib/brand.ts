/** Light, configurable branding (decision 14/10/2026). No third-party logos are bundled:
 *  put an approved logo file in public/brand/ and set NEXT_PUBLIC_LOGO_URL. */
export const brand = {
  product: process.env.NEXT_PUBLIC_BRAND_NAME || "Toán từng bước",
  org: process.env.NEXT_PUBLIC_ORG_NAME || "Minh Trí Academy",
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL || "",
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
};
