export type PaymentFeeMethod =
  | "RAZORPAY"
  | "PAYPAL"
  | "WISE"
  | "BANK_TRANSFER"
  | "UPI";

export type SupportedPaymentCurrency =
  | "AUD"
  | "CAD"
  | "USD"
  | "NZD"
  | "EUR"
  | "GBP"
  | "INR";

export interface PaymentFeeRule {
  percent: number;
  fixed: number;
}

export interface PaymentBreakdown {
  method: PaymentFeeMethod;
  currency: SupportedPaymentCurrency;

  baseAmount: number;
  processingFee: number;
  totalAmount: number;

  percentageRate: number;
  fixedFee: number;
}

/*
 * ------------------------------------------------------------
 * SUPPORTED CURRENCIES
 * ------------------------------------------------------------
 */

const SUPPORTED_CURRENCIES: SupportedPaymentCurrency[] = [
  "AUD",
  "CAD",
  "USD",
  "NZD",
  "EUR",
  "GBP",
  "INR",
];

/*
 * ------------------------------------------------------------
 * DEFAULT PAYMENT PROCESSING RATES
 * ------------------------------------------------------------
 *
 * These are the rates charged to the customer.
 *
 * IMPORTANT:
 *
 * We use a conservative rate so that after the provider
 * deducts its processing cost, Global Punjabi Classes still
 * receives the original class fee.
 *
 * Wise:
 *   8% safety rate based on the observed effective cost.
 *
 * PayPal:
 *   4.90% = 3.90% international commercial rate + 1%
 *   safety margin.
 *
 * Razorpay:
 *   4.54% = 3% international card fee + 18% GST (3.54%)
 *   + 1% safety margin.
 */

const DEFAULT_PERCENTAGES: Record<
  PaymentFeeMethod,
  number
> = {
  RAZORPAY: 4.54,
  PAYPAL: 4.90,
  WISE: 8.00,
  BANK_TRANSFER: 0,
  UPI: 0,
};

/*
 * ------------------------------------------------------------
 * PAYPAL FIXED FEES
 * ------------------------------------------------------------
 *
 * PayPal fixed fee depends on the currency received.
 */

const DEFAULT_PAYPAL_FIXED: Record<
  SupportedPaymentCurrency,
  number
> = {
  AUD: 0.30,
  CAD: 0.30,
  USD: 0.30,
  NZD: 0.45,
  EUR: 0.35,
  GBP: 0.20,
  INR: 0,
};

/*
 * Wise is intentionally modeled as an effective 8% rate.
 *
 * We do NOT add another fixed Wise fee here because the
 * observed 7–8% effective deduction is already being covered
 * by the 8% safety percentage.
 */

const DEFAULT_WISE_FIXED = 0;

/*
 * Razorpay does not use a separate fixed fee in this model.
 */
const DEFAULT_RAZORPAY_FIXED = 0;

/*
 * Manual methods have no automatic processing fee.
 */
const DEFAULT_MANUAL_FIXED = 0;

/*
 * ------------------------------------------------------------
 * ENV HELPERS
 * ------------------------------------------------------------
 */

function readPercentageEnv(
  key: string,
  fallback: number
) {
  const raw = process.env[key];

  if (
    raw === undefined ||
    raw === null ||
    raw.trim() === ""
  ) {
    return fallback;
  }

  const value = Number(raw);

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value >= 100
  ) {
    return fallback;
  }

  return value;
}

function readFixedEnv(
  key: string,
  fallback: number
) {
  const raw = process.env[key];

  if (
    raw === undefined ||
    raw === null ||
    raw.trim() === ""
  ) {
    return fallback;
  }

  const value = Number(raw);

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return fallback;
  }

  return value;
}

/*
 * ------------------------------------------------------------
 * NORMALIZATION
 * ------------------------------------------------------------
 */

function normalizeCurrency(
  currency: unknown
): SupportedPaymentCurrency {
  const value = String(currency || "")
    .trim()
    .toUpperCase();

  if (
    !SUPPORTED_CURRENCIES.includes(
      value as SupportedPaymentCurrency
    )
  ) {
    throw new Error(
      `Unsupported payment currency: ${value || "unknown"}`
    );
  }

  return value as SupportedPaymentCurrency;
}

function normalizeAmount(
  amount: unknown
) {
  const value = Number(amount);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      "Invalid payment amount."
    );
  }

  return Math.round(
    (value + Number.EPSILON) * 100
  ) / 100;
}

/*
 * ------------------------------------------------------------
 * PAYMENT FEE RULE
 * ------------------------------------------------------------
 */

export function getPaymentFeeRule(
  currencyInput: unknown,
  method: PaymentFeeMethod
): PaymentFeeRule {
  const currency =
    normalizeCurrency(currencyInput);

  if (
    !Object.prototype.hasOwnProperty.call(
      DEFAULT_PERCENTAGES,
      method
    )
  ) {
    throw new Error(
      `Unsupported payment method: ${method}`
    );
  }

  let percent =
    DEFAULT_PERCENTAGES[method];

  let fixed = 0;

  /*
   * Optional environment overrides.
   *
   * Example:
   *
   * PAYMENT_WISE_PERCENT=8
   * PAYMENT_PAYPAL_PERCENT=4.9
   * PAYMENT_RAZORPAY_PERCENT=4.54
   */

  if (method === "WISE") {
    percent = readPercentageEnv(
      "PAYMENT_WISE_PERCENT",
      8
    );

    fixed = readFixedEnv(
      `PAYMENT_WISE_FIXED_${currency}`,
      DEFAULT_WISE_FIXED
    );
  }

  if (method === "PAYPAL") {
    percent = readPercentageEnv(
      "PAYMENT_PAYPAL_PERCENT",
      4.9
    );

    fixed = readFixedEnv(
      `PAYMENT_PAYPAL_FIXED_${currency}`,
      DEFAULT_PAYPAL_FIXED[currency]
    );
  }

  if (method === "RAZORPAY") {
    percent = readPercentageEnv(
      "PAYMENT_RAZORPAY_PERCENT",
      4.54
    );

    fixed = readFixedEnv(
      `PAYMENT_RAZORPAY_FIXED_${currency}`,
      DEFAULT_RAZORPAY_FIXED
    );
  }

  if (
    method === "BANK_TRANSFER" ||
    method === "UPI"
  ) {
    percent = 0;

    fixed = readFixedEnv(
      `PAYMENT_${method}_FIXED_${currency}`,
      DEFAULT_MANUAL_FIXED
    );
  }

  return {
    percent,
    fixed,
  };
}

/*
 * ------------------------------------------------------------
 * CALCULATE CUSTOMER PAYMENT
 * ------------------------------------------------------------
 *
 * Gross-up formula:
 *
 * total = (base + fixed) / (1 - percentage)
 *
 * Example:
 *
 * Class fee = 79
 * Wise = 8%
 *
 * total = 79 / 0.92
 *       = 85.87
 *
 * Wise takes ~6.87
 * Global Punjabi Classes receives ~79.00
 *
 * This is different from simply doing:
 *
 * 79 + 8%
 *
 * because that would leave the platform slightly short after
 * the provider deducts its percentage.
 */

export function calculatePaymentFee(
  baseAmountInput: unknown,
  currencyInput: unknown,
  method: PaymentFeeMethod
): PaymentBreakdown {
  const baseAmount =
    normalizeAmount(baseAmountInput);

  const currency =
    normalizeCurrency(currencyInput);

  const rule =
    getPaymentFeeRule(
      currency,
      method
    );

  const percentage =
    rule.percent / 100;

  let totalAmount: number;

  /*
   * No processing fee.
   */
  if (
    percentage === 0 &&
    rule.fixed === 0
  ) {
    totalAmount = baseAmount;
  } else {
    const denominator =
      1 - percentage;

    if (denominator <= 0) {
      throw new Error(
        "Invalid payment processing percentage."
      );
    }

    totalAmount =
      (baseAmount + rule.fixed) /
      denominator;
  }

  totalAmount =
    Math.round(
      (totalAmount + Number.EPSILON) * 100
    ) / 100;

  const processingFee =
    Math.round(
      (totalAmount - baseAmount + Number.EPSILON) *
        100
    ) / 100;

  return {
    method,
    currency,

    baseAmount,

    processingFee,

    totalAmount,

    percentageRate:
      rule.percent,

    fixedFee:
      rule.fixed,
  };
}

/*
 * ------------------------------------------------------------
 * FORMAT PAYMENT AMOUNT
 * ------------------------------------------------------------
 */

export function formatPaymentAmount(
  currencyInput: unknown,
  amountInput: unknown
) {
  const currency =
    normalizeCurrency(currencyInput);

  const amount =
    normalizeAmount(amountInput);

  try {
    return new Intl.NumberFormat(
      "en",
      {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/*
 * ------------------------------------------------------------
 * SUPPORTED CURRENCY CHECK
 * ------------------------------------------------------------
 */

export function isSupportedPaymentCurrency(
  currency: unknown
) {
  const value = String(currency || "")
    .trim()
    .toUpperCase();

  return SUPPORTED_CURRENCIES.includes(
    value as SupportedPaymentCurrency
  );
}

/*
 * ------------------------------------------------------------
 * SUPPORTED CURRENCY LIST
 * ------------------------------------------------------------
 */

export function getSupportedPaymentCurrencies() {
  return [...SUPPORTED_CURRENCIES];
}
