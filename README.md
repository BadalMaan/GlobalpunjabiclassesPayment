# Global Punjabi Classes — Fee Payment Portal

Production-oriented Next.js + Supabase fee portal for Global Punjabi Classes.

## What is included

- Private per-student payment links: `/pay/<token>`
- Combined family payment links: `/pay/group/<token>`
- Secure operator dashboard: `/admin`
- Student search across name, age, days, teacher, country and parent contact
- Active / inactive student counts
- Country, currency, gender, teacher and learning-group filters
- Teacher overview with student counts
- Speaking Group / Writing Group / Reading Group
- USD / AUD / CAD / NZD / GBP / EUR / INR breakdowns
- One-click payment-link sending
- Same-parent detection by normalized email / WhatsApp number
- Optional merge flow for multiple children into one invoice/payment link
- Email payment-link delivery
- WhatsApp Business Cloud API delivery when configured
- Razorpay Orders + checkout verification + webhook processing
- PayPal Orders + capture + verified webhook processing
- Wise / Payoneer / Remitly / Bank / UPI payment instructions with manual reference verification
- Payment status model: PENDING → IN PROGRESS → RECEIVED
- Payment Process view and manual admin verification
- Payment events, audit logs and message logs
- PDF paid invoice generation and email delivery

## Important production boundary

The code never treats a browser success screen as proof of payment. Online gateways must be verified server-side. Bank/UPI and other external transfers only become RECEIVED automatically when a reliable provider/bank integration confirms them; otherwise they remain IN PROGRESS until an authorized operator verifies them.

Wise credentials/API access are not included because they must come from your own Wise Business integration. Payoneer API access similarly depends on the capabilities/approval of your account. Do not put secrets in GitHub.

## Existing deployment

This project is designed as an upgrade to the already deployed Global Punjabi Classes portal. Do not create a second Supabase project or Render service unless you intentionally want a separate environment.

### 1. Supabase

Run the existing schema if needed, then run:

`supabase/migrations/001_portal_upgrade.sql`

Do this in the same Supabase project used by the current portal.

### 2. Render environment variables

Copy the keys from `.env.example` into the existing Render service. Keep all real secrets in Render Environment Variables.

Required core values:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_JWT_SECRET`
- Gmail SMTP credentials

Payment providers:

- PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV`
- Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- Wise: only after your Wise Business API access is approved/configured
- Payoneer: only after the required API/merchant access is available

WhatsApp Business:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_FEE_TEMPLATE_NAME`
- `WHATSAPP_TEMPLATE_LANGUAGE`

Receiving details:

- `BANK1_*`
- `BANK2_*`
- `UPI_ID_1`
- `UPI_ID_2`
- `WISE_PAYMENT_LINK`
- `PAYONEER_PAYMENT_LINK`
- `REMITLY_INSTRUCTIONS`

### 3. Webhook URLs

Razorpay:

`https://YOUR_DOMAIN/api/payments/razorpay/webhook`

PayPal:

`https://YOUR_DOMAIN/api/payments/paypal/webhook`

Wise, once enabled for your account:

`https://YOUR_DOMAIN/api/payments/wise/webhook`

### 4. Build

Render can continue using:

- Build: `npm install`
- Start: `npm start`

## WhatsApp

The server uses the WhatsApp Business Cloud API with an approved template for business-initiated messages. The template should contain variables for:

1. Student name(s)
2. Fee month
3. Amount
4. Payment link

The actual template name and access token belong in Render, not GitHub.

## Bank / UPI

The payment page displays the bank and UPI details stored in Render environment variables. Keep real account details out of source control.

## Testing checklist before live money

1. Run Supabase migration in a staging/test environment first.
2. Test one student payment link.
3. Test a two-child merged payment link.
4. Test PayPal sandbox end-to-end.
5. Test Razorpay Test Mode end-to-end.
6. Verify webhook signatures.
7. Replay duplicate webhook events and confirm no duplicate payment.
8. Try the wrong amount/currency and confirm rejection.
9. Try to use one student's provider order against another student's link and confirm rejection.
10. Test failed, cancelled and expired payments.
11. Test manual Bank/UPI/Wise/Payoneer/Remitly verification.
12. Test email delivery and WhatsApp delivery separately.
13. Verify paid PDF invoices.
14. Only after all staging checks pass, switch provider credentials to live mode.
