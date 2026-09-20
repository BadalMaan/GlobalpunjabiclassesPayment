export const config = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
  businessName: process.env.BUSINESS_NAME || "Global Punjabi Classes",
  businessEmail: process.env.BUSINESS_EMAIL || "globalpunjabiclasses@gmail.com",
  businessPhone: process.env.BUSINESS_PHONE || "9915151216",
  businessWebsite: process.env.BUSINESS_WEBSITE || "https://www.globalpunjabiclasses.com",
  // Wise Business open link. The payment page adds amount/currency/description per invoice.
  wiseOpenPaymentLink: process.env.WISE_OPEN_PAYMENT_LINK || process.env.WISE_PAYMENT_LINK || "",
  // Payoneer links are created in the Payoneer dashboard. Keep this as a provider-hosted
  // fallback until/if your Payoneer account exposes an API for creating payment requests.
  payoneerPaymentLink: process.env.PAYONEER_PAYMENT_LINK || "",
  remitlyPaymentLink: process.env.REMITLY_PAYMENT_LINK || "",
  remitlyInstructions: process.env.REMITLY_INSTRUCTIONS || "Complete your Remitly transfer using the receiving instructions shown on this payment page.",
  upiIds: [process.env.UPI_ID_1, process.env.UPI_ID_2].filter(Boolean) as string[],
  banks: [
    { name: process.env.BANK1_NAME || "HDFC Bank", holder: process.env.BANK1_HOLDER || "", account: process.env.BANK1_ACCOUNT || "", ifsc: process.env.BANK1_IFSC || "", branch: process.env.BANK1_BRANCH || "", type: process.env.BANK1_TYPE || "" },
    { name: process.env.BANK2_NAME || "HDFC Bank", holder: process.env.BANK2_HOLDER || "", account: process.env.BANK2_ACCOUNT || "", ifsc: process.env.BANK2_IFSC || "", branch: process.env.BANK2_BRANCH || "", type: process.env.BANK2_TYPE || "" }
  ].filter(b=>b.holder || b.account || b.ifsc)
};

export function buildWisePaymentLink(input: { amount: string; currency: string; description: string }) {
  if (!config.wiseOpenPaymentLink) return "";
  try {
    const url = new URL(config.wiseOpenPaymentLink);
    url.searchParams.set("amount", input.amount);
    url.searchParams.set("currency", input.currency);
    url.searchParams.set("description", input.description.slice(0, 200));
    return url.toString();
  } catch {
    return "";
  }
}
