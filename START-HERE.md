# START HERE — Global Punjabi Classes Fee Portal

This is a complete standalone project. It is intentionally separate from the old GitHub project.

## Important
- Keep the old GitHub repository as your backup. Do not delete it.
- This project does NOT contain your real Supabase password, SMTP password, PayPal/Razorpay secrets, WhatsApp token, Wise credentials, Payoneer credentials, or real bank account values.
- Put secrets only in Render Environment Variables.

## Fresh setup order

### 1. GitHub
Create a NEW private GitHub repository, for example:
`globalpunjabiclassesfee-v2`

Extract this ZIP on your computer. Upload the CONTENTS of the extracted folder to the new repository root.

The root should contain:
- app/
- components/
- lib/
- public/
- supabase/
- package.json
- README.md
- START-HERE.md
- tsconfig.json
- next-env.d.ts
- .env.example

Do not upload a real `.env` file.

### 2. Supabase
Create a NEW Supabase project.
Open SQL Editor and run:
1. `supabase/schema.sql`
2. `supabase/migrations/001_portal_upgrade.sql`
3. `supabase/seed.sql` only if you want the sample seed data.

Use the NEW project's URL and service-role key later in Render.

### 3. Render
Create a NEW Web Service from the NEW GitHub repository.
Use:
- Build Command: `npm install && npm run build`
- Start Command: `npm start`

Add the variables from `.env.example` in Render. Use your real values there.

### 4. First test
After deployment succeeds, open:
`https://YOUR-RENDER-DOMAIN/admin/login`

Do not enable live payments yet.

### 5. Payments
Configure sandbox/test credentials first:
- PayPal sandbox
- Razorpay test mode
- WhatsApp Business Cloud API when ready
- Wise / Payoneer / Remitly public payment instructions and API integration only when your account supports it

Bank and UPI payments cannot be automatically marked RECEIVED without a reliable bank/provider transaction feed. They stay pending until verified.

## Existing student data
If you need the old portal's existing student/payment data, STOP before creating the new Supabase project and export the old database first. Starting fresh means the new database starts empty.
