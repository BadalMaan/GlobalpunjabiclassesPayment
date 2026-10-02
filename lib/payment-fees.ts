/**
 * Payment fee calculation
 *
 * The invoice amount remains the ORIGINAL CLASS FEE.
 *
 * Customer-facing payment total:
 *
 *   Class Fee
 * + Processing Fee
 * = Total Customer Pays
 *
 * Percentage-based provider fees are grossed up so that,
 * after the provider deducts its percentage, the business
 * still receives the original class fee.
 *
 * Example:
 *
 * Class fee = 69.00
 * Provider fee = 3%
 *
 * Customer pays:
 * 69 / (1 - 0.03)
 * = 71.13
 *
 * Provider keeps approximately 2.13
 * Business receives approximately 69.00
 *
 * IMPORTANT:
 * Provider rates can depend on the merchant account,
 * payment method, country and currency.
 *
 * Therefore the rates below are intentionally configurable
 * through environment variables.
 */

export type PaymentFeeMethod =
  | "RAZORPAY"
  | "PAYPAL"
  | "WISE"
  | "BANK_TRANSFER"
  | "UPI";

export type PaymentFeeResult = {
  baseAmount: number;
  processingFee: number;
  totalAmount: number;
  currency: string;
  method: PaymentFeeMethod;
  percentageRate: number;
  fixedFee: number;
};

type FeeRule = {
  /**
   * Percentage charged by the provider.
   *
   * Example:
   * 0.03 = 3%
   */
  percentage: number;

  /**
   * Fixed provider charge in the invoice currency.
   */
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

export type SupportedCurrency =
  (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Safely read a percentage from an environment variable.
 *
 * Environment value:
 *
 * PAYMENT_RAZORPAY_PERCENT=3
 *
 * becomes:
 *
 * 0.03
 */
function envPercent(
  name: string,
  fallbackPercent: number
) {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return fallbackPercent / 100;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value < 0) {
    return fallbackPercent / 100;
  }

  return value / 100;
}

/**
 * Safely read a fixed fee from an environment variable.
 */
function envFixed(
  name: string,
  fallback: number
) {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return value;
}

/**
 * Get the provider fee rule.
 *
 * IMPORTANT:
 *
 * These defaults are only fallback configuration.
 * Your actual provider/merchant agreement should be
 * used in production by setting the corresponding
 * environment variables.
 */
export function getPaymentFeeRule(
  method: PaymentFeeMethod,
  currency: string
): FeeRule {
  const code = String(currency || "")
    .trim()
    .toUpperCase();

  switch (method) {
    case "RAZORPAY":
      return {
        /*
         * Razorpay international-card style fallback:
         * 3% processing + 18% GST on the processing fee.
         *
         * Effective rate:
         * 3% × 1.18 = 3.54%
         *
         * This can be overridden from Render environment
         * variables with PAYMENT_RAZORPAY_PERCENT.
         */
        percentage: envPercent(
          "PAYMENT_RAZORPAY_PERCENT",
          3.54
        ),

        fixed: envFixed(
          `PAYMENT_RAZORPAY_FIXED_${code}`,
          0
        ),
      };

    case "PAYPAL":
      return {
        /*
         * PayPal international commercial fallback.
         *
         * Override this with:
         *
         * PAYMENT_PAYPAL_PERCENT
         * PAYMENT_PAYPAL_FIXED_AUD
         * PAYMENT_PAYPAL_FIXED_CAD
         * PAYMENT_PAYPAL_FIXED_USD
         * PAYMENT_PAYPAL_FIXED_NZD
         * PAYMENT_PAYPAL_FIXED_EUR
         * PAYMENT_PAYPAL_FIXED_GBP
         * PAYMENT_PAYPAL_FIXED_INR
         */
        percentage: envPercent(
          "PAYMENT_PAYPAL_PERCENT",
          4.4
        ),

        fixed: envFixed(
          `PAYMENT_PAYPAL_FIXED_${code}`,
          0
        ),
      };

    case "WISE":
      return {
        /*
         * Wise fees vary depending on how the payer pays
         * and the transaction route.
         *
         * Therefore Wise is configurable rather than using
         * a fake universal fee.
         *
         * Set:
         *
         * PAYMENT_WISE_PERCENT
         * PAYMENT_WISE_FIXED_AUD
         * PAYMENT_WISE_FIXED_CAD
         * etc.
         */
        percentage: envPercent(
          "PAYMENT_WISE_PERCENT",
          0
        ),

        fixed: envFixed(
          `PAYMENT_WISE_FIXED_${code}`,
          0
        ),
      };

    case "BANK_TRANSFER":
      return {
        /*
         * No additional portal fee.
         */
        percentage: 0,
        fixed: 0,
      };

    case "UPI":
      return {
        /*
         * No additional portal fee.
         */
        percentage: 0,
        fixed: 0,
      };

    default:
      return {
        percentage: 0,
        fixed: 0,
      };
  }
}

/**
 * Round money to two decimal places.
 */
export function roundMoney(
  amount: number
) {
  return Math.round(
    (amount + Number.EPSILON) * 100
  ) / 100;
}

/**
 * Calculate the customer payment amount.
 *
 * For a percentage-based provider fee:
 *
 * total =
 *   (base + fixed) / (1 - percentage)
 *
 * This is the important "gross-up" calculation.
 */
export function calculatePaymentFee(
  baseAmountInput: unknown,
  currencyInput: unknown,
  method: PaymentFeeMethod
): PaymentFeeResult {
  const baseAmount = Number(
    baseAmountInput
  );

  if (
    !Number.isFinite(baseAmount) ||
    baseAmount <= 0
  ) {
    throw new Error(
      "Invalid payment amount."
    );
  }

  const currency = String(
    currencyInput || ""
  )
    .trim()
    .toUpperCase();

  if (!currency) {
    throw new Error(
      "Payment currency is required."
    );
  }

  const rule = getPaymentFeeRule(
    method,
    currency
  );

  if (
    rule.percentage < 0 ||
    rule.percentage >= 1
  ) {
    throw new Error(
      "Invalid payment processing percentage."
    );
  }

  const base = roundMoney(
    baseAmount
  );

  const processingFee =
    rule.percentage === 0
      ? roundMoney(rule.fixed)
      : roundMoney(
          (base + rule.fixed) /
            (1 - rule.percentage) -
            base
        );

  const totalAmount = roundMoney(
    base + processingFee
  );

  return {
    baseAmount: base,
    processingFee,
    totalAmount,
    currency,
    method,
    percentageRate:
      rule.percentage,
    fixedFee: rule.fixed,
  };
}

/**
 * Calculate a payment fee using an already-normalized
 * payment method.
 */
export function getPaymentBreakdown(
  baseAmount: unknown,
  currency: unknown,
  method: string
) {
  const normalizedMethod =
    String(method || "")
      .trim()
      .toUpperCase() as PaymentFeeMethod;

  const allowed: PaymentFeeMethod[] = [
    "RAZORPAY",
    "PAYPAL",
    "WISE",
    "BANK_TRANSFER",
    "UPI",
  ];

  if (
    !allowed.includes(
      normalizedMethod
    )
  ) {
    throw new Error(
      `Unsupported payment method: ${method}`
    );
  }

  return calculatePaymentFee(
    baseAmount,
    currency,
    normalizedMethod
  );
}

/**
 * Format a money amount for the UI.
 *
 * Example:
 *
 * AUD 71.13
 */
export function formatPaymentAmount(
  currency: string,
  amount: number
) {
  return `${String(currency || "")
    .trim()
    .toUpperCase()} ${roundMoney(amount).toFixed(2)}`;
}

/**
 * Check whether a currency is supported by the portal.
 */
export function isSupportedPaymentCurrency(
  currency: string
) {
  return SUPPORTED_CURRENCIES.includes(
    String(currency || "")
      .trim()
      .toUpperCase() as SupportedCurrency
  );
}
