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
  const value = Number(
    process.env[name]
  );

  return Number.isFinite(value)
    ? value
    : fallback;
}

export function roundMoney(
  value: number
): number {
  return (
    Math.round(
      (value + Number.EPSILON) * 100
    ) / 100
  );
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
 * WISE:
 *
 * We intentionally use the highest Wise
 * card-processing percentage every time.
 *
 * For an Australia-registered Wise Business
 * account:
 *
 * Highest rate:
 * 3.5% + 0.30 AUD
 *
 * The 3.5% percentage is therefore used
 * for every supported payment currency.
 *
 * IMPORTANT:
 *
 * The fixed Wise charge is NOT automatically
 * treated as 0.30 in every currency.
 *
 * For AUD:
 *   default = 0.30 AUD
 *
 * For other currencies:
 *   configure the appropriate fixed amount
 *   using the environment variables below:
 *
 *   PAYMENT_WISE_FIXED_CAD
 *   PAYMENT_WISE_FIXED_USD
 *   PAYMENT_WISE_FIXED_NZD
 *   PAYMENT_WISE_FIXED_EUR
 *   PAYMENT_WISE_FIXED_GBP
 *
 * This prevents us from incorrectly charging
 * 0.30 USD, 0.30 CAD, etc. when the actual
 * Wise fixed charge is denominated differently.
 */
export function getPaymentFeeRule(
  currency: unknown,
  method: PaymentFeeMethod
): PaymentFeeRule {
  const code =
    normalizeCurrency(currency);

  switch (method) {
    case "WISE": {
      const fixedEnvironmentName =
        `PAYMENT_WISE_FIXED_${code}`;

      const defaultFixed =
        code === "AUD"
          ? 0.30
          : 0;

      return {
        /*
         * Highest Wise percentage.
         *
         * We deliberately use 3.5% every time
         * rather than trying to determine whether
         * the customer's card is domestic,
         * international, consumer or business.
         */
        percent: envNumber(
          "PAYMENT_WISE_PERCENT",
          3.5
        ),

        fixed: envNumber(
          fixedEnvironmentName,
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
 * Calculate the customer-facing payment amount.
 *
 * Gross-up formula:
 *
 * total =
 *   (base + fixed) / (1 - percentage)
 *
 * This means the processor's percentage
 * and fixed charge are effectively paid by
 * the customer while the platform receives
 * the original class fee.
 *
 * Example:
 *
 * Class fee = 79
 * Wise percentage = 3.5%
 * Fixed fee = 0.30
 *
 * Customer total is grossed up so that the
 * remaining amount after Wise's processing
 * charge is approximately the original 79.
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

  if (percentage < 0) {
    throw new Error(
      "Payment processing percentage cannot be negative"
    );
  }

  if (percentage >= 1) {
    throw new Error(
      "Payment processing percentage must be less than 100%"
    );
  }

  let total: number;

  if (percentage === 0) {
    total =
      base + rule.fixed;
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

    totalAmount:
      total,

    percent:
      rule.percent,

    fixed:
      rule.fixed,
  };
}

/**
 * Alias used by payment UI/components.
 */
export function getPaymentBreakdown(
  baseAmount: unknown,
  currency: unknown,
  method: PaymentFeeMethod
): PaymentBreakdown {
  return calculatePaymentFee(
    baseAmount,
    currency,
    method
  );
}

/**
 * Format a payment amount for display.
 *
 * Example:
 *
 * AUD 79.00
 * USD 82.50
 * GBP 64.20
 */
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

/**
 * Check whether a currency is supported
 * by the payment system.
 */
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
