export type PaymentFeeMethod =
  | "RAZORPAY"
  | "PAYPAL"
  | "WISE"
  | "BANK_TRANSFER"
  | "UPI";

export type PaymentFeeRule = {
  percent: number;
  fixed: number;
};

export type PaymentBreakdown = {
  method: PaymentFeeMethod;
  currency: string;
  baseAmount: number;
  processingFee: number;
  totalAmount: number;
  percent: number;
  fixed: number;
};

const SUPPORTED_CURRENCIES = [
  "AUD",
  "CAD",
  "USD",
  "NZD",
  "EUR",
  "GBP",
  "INR",
] as const;

function envNumber(
  name: string,
  fallback: number
): number {
  const value = Number(process.env[name]);

  return Number.isFinite(value)
    ? value
    : fallback;
}

export function roundMoney(
  value: number
): number {
  return Math.round(
    (value + Number.EPSILON) * 100
  ) / 100;
}

function normalizeCurrency(
  currency: unknown
): string {
  return String(currency || "")
    .trim()
    .toUpperCase();
}

/**
 * Payment processing rules.
 *
 * IMPORTANT:
 * Wise is intentionally charged using the
 * highest card-processing percentage every time.
 *
 * Australia Wise Business:
 * 3.5% + 0.30 AUD
 *
 * For other currencies, the fixed amount can be
 * configured separately through:
 *
 * PAYMENT_WISE_FIXED_AUD
 * PAYMENT_WISE_FIXED_CAD
 * PAYMENT_WISE_FIXED_USD
 * PAYMENT_WISE_FIXED_NZD
 * PAYMENT_WISE_FIXED_EUR
 * PAYMENT_WISE_FIXED_GBP
 *
 * This avoids incorrectly treating 0.30 AUD as
 * 0.30 USD / CAD / GBP / EUR / NZD.
 */
export function getPaymentFeeRule(
  currency: unknown,
  method: PaymentFeeMethod
): PaymentFeeRule {
  const code =
    normalizeCurrency(currency);

  switch (method) {
    case "WISE": {
      const fixedName =
        `PAYMENT_WISE_FIXED_${code}`;

      const defaultFixed =
        code === "AUD" ? 0.30 : 0;

      return {
        percent: envNumber(
          "PAYMENT_WISE_PERCENT",
          3.5
        ),
        fixed: envNumber(
          fixedName,
          defaultFixed
        ),
      };
    }

    case "RAZORPAY":
      return {
        percent: envNumber(
          "PAYMENT_RAZORPAY_PERCENT",
          3.54
        ),
        fixed: envNumber(
          `PAYMENT_RAZORPAY_FIXED_${code}`,
          0
        ),
      };

    case "PAYPAL":
      return {
        percent: envNumber(
          "PAYMENT_PAYPAL_PERCENT",
          4.4
        ),
        fixed: envNumber(
          `PAYMENT_PAYPAL_FIXED_${code}`,
          0
        ),
      };

    case "BANK_TRANSFER":
    case "UPI":
      return {
        percent: 0,
        fixed: 0,
      };

    default:
      return {
        percent: 0,
        fixed: 0,
      };
  }
}

/**
 * Calculates the customer-facing amount.
 *
 * Gross-up formula:
 *
 * total = (base + fixed) / (1 - percentage)
 *
 * This ensures that after the payment processor
 * deducts its percentage + fixed fee, the platform
 * still receives the original class fee.
 *
 * Example:
 *
 * Base = 79
 * Fee = 3.5%
 *
 * Customer pays slightly more than 79 so that
 * the processor's fee does not reduce the
 * original class fee.
 */
export function calculatePaymentFee(
  baseAmount: unknown,
  currency: unknown,
  method: PaymentFeeMethod
): PaymentBreakdown {
  const base =
    Number(baseAmount);

  if (
    !Number.isFinite(base) ||
    base < 0
  ) {
    throw new Error(
      "Invalid payment amount"
    );
  }

  const code =
    normalizeCurrency(currency);

  if (
    !SUPPORTED_CURRENCIES.includes(
      code as
        (typeof SUPPORTED_CURRENCIES)[number]
    )
  ) {
    throw new Error(
      `Unsupported payment currency: ${code}`
    );
  }

  const rule =
    getPaymentFeeRule(
      code,
      method
    );

  const percentage =
    rule.percent / 100;

  let total: number;

  if (percentage <= 0) {
    total =
      base + rule.fixed;
  } else if (percentage >= 1) {
    throw new Error(
      "Payment processing percentage must be less than 100%"
    );
  } else {
    total =
      (base + rule.fixed) /
      (1 - percentage);
  }

  total =
    roundMoney(total);

  const processingFee =
    roundMoney(
      total - base
    );

  return {
    method,
    currency: code,
    baseAmount:
      roundMoney(base),
    processingFee,
    totalAmount: total,
    percent:
      rule.percent,
    fixed:
      rule.fixed,
  };
}

export function getPaymentBreakdown(
  baseAmount: unknown,
  currency: unknown,
  method: PaymentFeeMethod
) {
  return calculatePaymentFee(
    baseAmount,
    currency,
    method
  );
}

export function formatPaymentAmount(
  currency: unknown,
  amount: unknown
): string {
  const code =
    normalizeCurrency(currency);

  const value =
    Number(amount);

  if (!Number.isFinite(value)) {
    return `${code} 0.00`;
  }

  return `${code} ${value.toFixed(2)}`;
}

export function isSupportedPaymentCurrency(
  currency: unknown
): boolean {
  const code =
    normalizeCurrency(currency);

  return (
    SUPPORTED_CURRENCIES.includes(
      code as
        (typeof SUPPORTED_CURRENCIES)[number]
    )
  );
}
