import nodemailer from "nodemailer";
import { config } from "./config";
import { feeEmail } from "./messages";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE) === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[];
}) {
  return transporter.sendMail({
    from:
      process.env.MAIL_FROM ||
      `${config.businessName} <${config.businessEmail}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments,
  });
}

export { feeEmail };

export const feePendingEmail = feeEmail;

export function paymentSuccessEmail(input: {
  studentName: string;
  monthLabel: string;
  amount: string;
  currency: string;
  invoiceNumber: string;
  portalUrl: string;
}) {
  return `<!doctype html>
<html>
<body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#12203a">
<div style="max-width:680px;margin:30px auto;background:#fff;border:1px solid #e8edf5;border-radius:24px;overflow:hidden">

<div style="padding:32px;background:#071f49;color:#fff">
<div style="font-size:12px;letter-spacing:2px;font-weight:800">
GLOBAL PUNJABI CLASSES
</div>

<h1 style="margin:12px 0 0;font-size:28px">
Payment Received
</h1>
</div>

<div style="padding:34px">

<p><b>Sat Shri Akal Ji</b></p>

<p>
We are pleased to confirm that the monthly fee payment for
<b>${input.studentName}</b>
has been received and verified.
</p>

<div style="background:#f6f8fc;border-radius:18px;padding:22px;margin:24px 0">

<div>
Fee Month:
<b>${input.monthLabel}</b>
</div>

<div style="margin-top:8px">
Amount:
<b>${input.currency} ${input.amount}</b>
</div>

<div style="margin-top:8px">
Invoice:
<b>${input.invoiceNumber}</b>
</div>

<div style="margin-top:8px">
Status:
<b style="color:#166534">RECEIVED</b>
</div>

</div>

<p>
<a
href="${input.portalUrl}"
style="display:inline-block;background:#071f49;color:#fff;text-decoration:none;padding:15px 22px;border-radius:12px;font-weight:800"
>
VIEW PAYMENT RECEIPT
</a>
</p>

<p>
Thank you for your continued support of Global Punjabi Classes.
</p>

<p>
Regards,<br>
<b>Global Punjabi Classes</b><br>
${config.businessEmail}
</p>

</div>
</div>
</body>
</html>`;
}
