import nodemailer, {
  type SendMailOptions,
  type Transporter,
} from "nodemailer";
import { config } from "./config";
import { feeEmail } from "./messages";

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Email is not configured: missing ${name}`
    );
  }

  return value;
}

function createTransporter(): Transporter {
  const host = getRequiredEnv("SMTP_HOST");
  const user = getRequiredEnv("SMTP_USER");
  const password = getRequiredEnv("SMTP_PASSWORD");

  const port = Number(
    process.env.SMTP_PORT || "465"
  );

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      "Email is not configured: SMTP_PORT must be a valid port number"
    );
  }

  /*
   * Gmail:
   * Port 465 -> SMTP_SECURE=true
   * Port 587 -> SMTP_SECURE=false
   *
   * If SMTP_SECURE is set in Render, that value is used.
   */
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? String(process.env.SMTP_SECURE).toLowerCase() === "true"
      : port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass: password,
    },

    /*
     * Prevent the request from hanging indefinitely
     * if the SMTP server cannot be reached.
     */
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

function getMailFrom() {
  return (
    process.env.MAIL_FROM?.trim() ||
    `${config.businessName} <${config.businessEmail}>`
  );
}

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
  const to = opts.to?.trim();

  if (!to) {
    throw new Error(
      "Email could not be sent: recipient email is empty"
    );
  }

  const subject = opts.subject?.trim();

  if (!subject) {
    throw new Error(
      "Email could not be sent: email subject is empty"
    );
  }

  if (!opts.html?.trim()) {
    throw new Error(
      "Email could not be sent: email body is empty"
    );
  }

  const transporter = createTransporter();

  const message: SendMailOptions = {
    from: getMailFrom(),
    to,
    subject,
    html: opts.html,
    attachments: opts.attachments,
  };

  try {
    const info = await transporter.sendMail(message);

    /*
     * SMTP accepted the email for delivery.
     */
    return {
      ...info,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
    };
  } catch (error: any) {
    const code = error?.code
      ? ` [${error.code}]`
      : "";

    const response = error?.response
      ? ` — ${error.response}`
      : "";

    throw new Error(
      `SMTP email delivery failed${code}: ${
        error?.message || "Unknown SMTP error"
      }${response}`
    );
  }
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

<p>
<b>Sat Shri Akal Ji</b>
</p>

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
