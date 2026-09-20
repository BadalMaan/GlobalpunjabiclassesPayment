export const config = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
  businessName: process.env.BUSINESS_NAME || "Global Punjabi Classes",
  businessEmail: process.env.BUSINESS_EMAIL || "globalpunjabiclasses@gmail.com",
  businessPhone: process.env.BUSINESS_PHONE || "9915151216",
  businessWebsite: process.env.BUSINESS_WEBSITE || "https://www.globalpunjabiclasses.com",
  wisePaymentLink: process.env.WISE_PAYMENT_LINK || "",
  paypalPaymentLink: process.env.PAYPAL_PAYMENT_LINK || "https://paypal.me/BadalSingh45",
  upiIds: [process.env.UPI_ID_1, process.env.UPI_ID_2].filter(Boolean) as string[],
  banks: [
    { name: process.env.BANK1_NAME || "HDFC Bank", holder: process.env.BANK1_HOLDER || "", account: process.env.BANK1_ACCOUNT || "", ifsc: process.env.BANK1_IFSC || "", branch: process.env.BANK1_BRANCH || "", type: process.env.BANK1_TYPE || "" },
    { name: process.env.BANK2_NAME || "HDFC Bank", holder: process.env.BANK2_HOLDER || "", account: process.env.BANK2_ACCOUNT || "", ifsc: process.env.BANK2_IFSC || "", branch: process.env.BANK2_BRANCH || "", type: process.env.BANK2_TYPE || "" }
  ].filter(b=>b.holder || b.account || b.ifsc)
};
