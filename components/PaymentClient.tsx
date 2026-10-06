"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import {
  calculatePaymentFee,
  formatPaymentAmount,
  type PaymentFeeMethod,
} from "@/lib/payment-fees";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

type Method =
  | "RAZORPAY"
  | "PAYPAL"
  | "WISE"
  | "BANK_TRANSFER"
  | "UPI";

const METHODS: Method[] = [
  "RAZORPAY",
  "PAYPAL",
  "WISE",
  "BANK_TRANSFER",
  "UPI",
];

function normalizeDisplayAmount(amount: unknown) {
  if (typeof amount === "number") {
    return Number.isFinite(amount) && amount > 0
      ? Math.round((amount + Number.EPSILON) * 100) / 100
      : null;
  }

  if (typeof amount === "string") {
    const cleaned = amount
      .trim()
      .replace(/,/g, "")
      .replace(/[^0-9.-]/g, "");

    if (!cleaned) {
      return null;
    }

    const value = Number(cleaned);

    return Number.isFinite(value) && value > 0
      ? Math.round((value + Number.EPSILON) * 100) / 100
      : null;
  }

  const value = Number(amount);

  return Number.isFinite(value) && value > 0
    ? Math.round((value + Number.EPSILON) * 100) / 100
    : null;
}

function getPaymentBreakdown(
  amount: unknown,
  currency: unknown,
  method: Method
) {
  /*
   * BANK_TRANSFER and UPI are manual methods.
   * They have ZERO processing fee, so do NOT call
   * calculatePaymentFee() for these methods.
   *
   * This is intentional: manual payment selection must
   * never crash the payment page because of the processor
   * fee calculator.
   */
  if (
    method === "BANK_TRANSFER" ||
    method === "UPI"
  ) {
    const baseAmount =
      normalizeDisplayAmount(amount);

    const currencyValue =
      String(currency || "")
        .trim()
        .toUpperCase();

    if (
      baseAmount === null ||
      !currencyValue
    ) {
      return null;
    }

    return {
      method,
      currency: currencyValue as any,
      baseAmount,
      processingFee: 0,
      totalAmount: baseAmount,
      percentageRate: 0,
      fixedFee: 0,
    };
  }

  const normalizedAmount =
    normalizeDisplayAmount(amount);

  if (
    normalizedAmount === null
  ) {
    return null;
  }

  try {
    return calculatePaymentFee(
      normalizedAmount,
      currency,
      method as PaymentFeeMethod
    );
  } catch {
    return null;
  }
}

export default function PaymentClient({
  invoice,
  config,
}: {
  invoice: any;
  config: any;
}) {
  const [method, setMethod] =
    useState<Method | null>(null);

  const [busy, setBusy] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [ref, setRef] =
    useState("");

  const [paid, setPaid] =
    useState(invoice.status === "PAID");

  const [progress, setProgress] =
    useState(
      invoice.status === "PROCESSING" ||
        invoice.status === "VERIFYING"
    );

  const [razorpayReady, setRazorpayReady] =
    useState(false);

  const names =
    invoice.studentNames || [];

  /*
   * Calculate the fee for the currently
   * selected payment method.
   *
   * IMPORTANT:
   * invoice.amount remains the original
   * class fee.
   */
  const selectedBreakdown =
    useMemo(() => {
      if (!method) {
        return null;
      }

      return getPaymentBreakdown(
        invoice?.amount,
        invoice?.currency,
        method
      );
    }, [
      method,
      invoice?.amount,
      invoice?.currency,
    ]);

  useEffect(() => {
    const qs =
      new URLSearchParams(
        window.location.search
      );

    const selected =
      qs.get("method") as Method | null;

    if (
      selected &&
      METHODS.includes(selected)
    ) {
      setMethod(selected);
    }

    /*
     * PayPal returns to this page with:
     *
     * ?paypal=success&token=PAYPAL_ORDER_ID
     *
     * The existing server capture endpoint
     * then verifies the order.
     */
    if (
      qs.get("paypal") === "success" &&
      qs.get("token")
    ) {
      setBusy(true);

      fetch(
        invoice.type === "group"
          ? "/api/payments/paypal/group-capture"
          : "/api/payments/paypal/capture",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            token: invoice.token,
            orderId:
              qs.get("token"),
          }),
        }
      )
        .then(async (r) => {
          if (r.ok) {
            setPaid(true);
          } else {
            const d =
              await r
                .json()
                .catch(() => ({}));

            setMessage(
              d.error ||
                "PayPal confirmation failed."
            );
          }
        })
        .finally(() =>
          setBusy(false)
        );
    }
  }, [
    invoice.token,
    invoice.type,
  ]);

  useEffect(() => {
    const onPopState = () => {
      const qs =
        new URLSearchParams(
          window.location.search
        );

      const selected =
        qs.get("method") as Method | null;

      setMethod(
        selected &&
          METHODS.includes(selected)
          ? selected
          : null
      );

      setMessage("");
      setRef("");
    };

    window.addEventListener(
      "popstate",
      onPopState
    );

    return () => {
      window.removeEventListener(
        "popstate",
        onPopState
      );
    };
  }, []);

  function openMethod(
    next: Method
  ) {
    setMethod(next);
    setMessage("");
    setRef("");

    const url =
      new URL(
        window.location.href
      );

    url.searchParams.set(
      "method",
      next
    );

    window.history.pushState(
      { method: next },
      "",
      url.toString()
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function goBack() {
    setMethod(null);
    setMessage("");
    setRef("");

    const url =
      new URL(
        window.location.href
      );

    url.searchParams.delete(
      "method"
    );

    window.history.pushState(
      {},
      "",
      url.toString()
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function manualSubmit() {
    if (
      !method ||
      !ref.trim()
    ) {
      setMessage(
        "Please enter the payment reference number."
      );

      return;
    }

    setBusy(true);
    setMessage("");

    const endpoint =
      invoice.type === "group"
        ? "/api/payments/manual-group"
        : "/api/payments/manual";

    const r = await fetch(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          token: invoice.token,
          method,
          reference:
            ref.trim(),
        }),
      }
    );

    const d =
      await r
        .json()
        .catch(() => ({}));

    setBusy(false);

    if (r.ok) {
      setProgress(true);

      setMessage(
        "Payment details submitted. The payment is now under verification."
      );
    } else {
      setMessage(
        d.error ||
          "Could not submit payment details."
      );
    }
  }

  async function payRazorpay() {
    setBusy(true);
    setMessage("");

    const endpoint =
      invoice.type === "group"
        ? "/api/payments/razorpay/group-create-order"
        : "/api/payments/razorpay/create-order";

    const r = await fetch(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          token: invoice.token,
        }),
      }
    );

    const d =
      await r
        .json()
        .catch(() => ({}));

    if (!r.ok) {
      setBusy(false);

      setMessage(
        d.error ||
          "Could not start Razorpay."
      );

      return;
    }

    if (!window.Razorpay) {
      setBusy(false);

      setMessage(
        "Razorpay checkout is still loading. Please try again."
      );

      return;
    }

    const rz =
      new window.Razorpay({
        key: d.key,
        amount: d.amount,
        currency: d.currency,

        name:
          "Global Punjabi Classes",

        description:
          `Monthly fee — ${names.join(
            " & "
          )}`,

        order_id:
          d.orderId,

        prefill: {
          name: "",
          email: "",
        },

        theme: {
          color: "#0b2a5b",
        },

        handler:
          async (
            response: any
          ) => {
            const verify =
              await fetch(
                invoice.type ===
                  "group"
                  ? "/api/payments/razorpay/group-verify"
                  : "/api/payments/razorpay/verify",
                {
                  method:
                    "POST",

                  headers: {
                    "Content-Type":
                      "application/json",
                  },

                  body:
                    JSON.stringify({
                      token:
                        invoice.token,
                      ...response,
                    }),
                }
              );

            const vd =
              await verify
                .json()
                .catch(
                  () => ({})
                );

            if (verify.ok) {
              setPaid(true);
            } else {
              setMessage(
                vd.error ||
                  "Payment verification failed."
              );
            }

            setBusy(false);
          },
      });

    rz.on(
      "payment.failed",
      (e: any) => {
        setBusy(false);

        setMessage(
          e?.error
            ?.description ||
            "Razorpay payment failed."
        );
      }
    );

    rz.open();
  }

  /*
   * PayPal:
   *
   * Create the PayPal order through our
   * existing API and then redirect the
   * customer to PayPal's approval page.
   */
  async function payPayPal() {
    setBusy(true);
    setMessage("");

    const endpoint =
      invoice.type === "group"
        ? "/api/payments/paypal/group-create-order"
        : "/api/payments/paypal/create-order";

    try {
      const r =
        await fetch(
          endpoint,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                token:
                  invoice.token,
              }),
          }
        );

      const d =
        await r
          .json()
          .catch(
            () => ({})
          );

      if (!r.ok) {
        setBusy(false);

        setMessage(
          d.error ||
            "Could not start PayPal."
        );

        return;
      }

      const approveLink =
        Array.isArray(
          d.links
        )
          ? d.links.find(
              (x: any) =>
                x?.rel ===
                "approve"
            )?.href
          : null;

      if (!approveLink) {
        setBusy(false);

        setMessage(
          "PayPal approval link was not returned."
        );

        return;
      }

      window.location.href =
        approveLink;
    } catch {
      setBusy(false);

      setMessage(
        "Could not start PayPal."
      );
    }
  }

  /*
   * Wise open payment link.
   *
   * Wise allows amount, currency and
   * description to be pre-filled in
   * the open payment-link URL.
   */
  function getWisePaymentUrl() {
    if (
      !config.wisePaymentLink ||
      !selectedBreakdown
    ) {
      return "";
    }

    const url =
      new URL(
        config.wisePaymentLink
      );

    url.searchParams.set(
      "amount",
      selectedBreakdown.totalAmount.toFixed(
        2
      )
    );

    url.searchParams.set(
      "currency",
      String(
        invoice.currency
      ).toUpperCase()
    );

    url.searchParams.set(
      "description",
      `Global Punjabi Classes — ${names.join(
        " & "
      )} — ${invoice.month}`
    );

    return url.toString();
  }

  function openWise() {
    const url =
      getWisePaymentUrl();

    if (!url) {
      setMessage(
        "Wise payment link is not configured."
      );

      return;
    }

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  }

  if (paid) {
    return (
      <div className="paymentSuccessPage">
        <div className="paymentSuccessCard">

          <div className="successIcon">
            ✓
          </div>

          <div className="paymentEyebrow">
            PAYMENT COMPLETE
          </div>

          <h1>
            Payment Received
          </h1>

          <p>
            Your payment has been
            successfully received
            and verified.
          </p>

          <div className="paymentSuccessAmount">
            {invoice.currency}{" "}
            {invoice.amount}
          </div>

          <small>
            A receipt/invoice will
            be sent to the registered
            email address.
          </small>

        </div>
      </div>
    );
  }

  return (
    <div className="paymentExperience">

      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onLoad={() =>
          setRazorpayReady(
            true
          )
        }
      />

      {/* BRAND */}

      <div className="paymentBrand">

        <div className="paymentBrandMark">
          GPC
        </div>

        <div>
          <strong>
            Global Punjabi Classes
          </strong>

          <span>
            Secure Fee Payment
          </span>
        </div>

      </div>

      <div className="paymentLayout">

        {/* LEFT SUMMARY */}

        <aside className="paymentSummary">

          <div className="paymentEyebrow">
            MONTHLY FEE
          </div>

          <h1>
            {names.join(" & ")}
          </h1>

          <div className="paymentPeriod">
            {invoice.month}
          </div>

          {invoice.items?.length >
            0 && (
            <div className="studentBreakdown">

              {invoice.items.map(
                (x: any) => (
                  <div
                    className="breakRow"
                    key={x.id}
                  >
                    <span>
                      {x.name}
                    </span>

                    <b>
                      {
                        invoice.currency
                      }{" "}
                      {
                        x.amount
                      }
                    </b>
                  </div>
                )
              )}

            </div>
          )}

          {/*
           * IMPORTANT:
           *
           * This is ALWAYS the original
           * class fee.
           *
           * Processing charges are NOT
           * added to this left-side box.
           */}
          <div className="paymentTotalBox">

            <span>
              Total Amount
            </span>

            <strong>
              {invoice.currency}{" "}
              {invoice.amount}
            </strong>

          </div>

          <div
            className={`paymentStatus ${
              progress
                ? "paymentStatusProgress"
                : "paymentStatusPending"
            }`}
          >

            <span />

            {progress
              ? "PAYMENT IN PROGRESS"
              : "PAYMENT PENDING"}

          </div>

          <div className="paymentSecurity">

            <span>
              🔒
            </span>

            <div>

              <b>
                Secure payment link
              </b>

              <small>
                This link is associated
                with this invoice only.
              </small>

            </div>

          </div>

        </aside>

        {/* RIGHT PAYMENT AREA */}

        <section className="paymentMain">

          {!method ? (
            <>

              <div className="paymentMainHeader">

                <div>

                  <div className="paymentEyebrow">
                    PAYMENT OPTIONS
                  </div>

                  <h2>
                    Choose a payment
                    method
                  </h2>

                  <p>
                    Select your preferred
                    payment method to
                    continue securely.
                  </p>

                </div>

              </div>

              <div className="paymentMethods">

                <MethodCard
                  icon="R"
                  title="Razorpay"
                  description="Cards, UPI and supported payment methods."
                  onClick={() =>
                    openMethod(
                      "RAZORPAY"
                    )
                  }
                />

                <MethodCard
                  icon="P"
                  title="PayPal"
                  description="Secure payment through PayPal."
                  onClick={() =>
                    openMethod(
                      "PAYPAL"
                    )
                  }
                />

                <MethodCard
                  icon="W"
                  title="Wise"
                  description="Pay using Wise Business."
                  onClick={() =>
                    openMethod(
                      "WISE"
                    )
                  }
                />

                <MethodCard
                  icon="B"
                  title="Bank Transfer"
                  description="Transfer the fee directly to our bank account."
                  onClick={() =>
                    openMethod(
                      "BANK_TRANSFER"
                    )
                  }
                />

                <MethodCard
                  icon="U"
                  title="UPI"
                  description="Pay directly using one of our official UPIs."
                  onClick={() =>
                    openMethod(
                      "UPI"
                    )
                  }
                />

              </div>

              <div className="paymentVerification">

                <span>
                  ✓
                </span>

                <div>

                  <b>
                    Payment verification
                  </b>

                  <small>
                    Online payments are
                    confirmed through the
                    payment provider.
                    Bank and UPI payments
                    remain under
                    verification until
                    authorized confirmation.
                  </small>

                </div>

              </div>

            </>
          ) : (
            <MethodScreen
              method={method}
              invoice={invoice}
              config={config}
              breakdown={
                selectedBreakdown
              }
              busy={busy}
              message={message}
              refValue={ref}
              setRef={setRef}
              submit={manualSubmit}
              payRazorpay={
                payRazorpay
              }
              payPayPal={
                payPayPal
              }
              openWise={
                openWise
              }
              razorpayReady={
                razorpayReady
              }
              goBack={goBack}
            />
          )}

        </section>

      </div>

    </div>
  );
}

function MethodCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      className="paymentMethodCard"
      onClick={onClick}
    >

      <span className="paymentMethodIcon">
        {icon}
      </span>

      <span className="paymentMethodContent">

        <strong>
          {title}
        </strong>

        <small>
          {description}
        </small>

      </span>

      <span className="paymentMethodArrow">
        →
      </span>

    </button>
  );
}

function MethodScreen({
  method,
  invoice,
  config,
  breakdown,
  busy,
  message,
  refValue,
  setRef,
  submit,
  payRazorpay,
  payPayPal,
  openWise,
  razorpayReady,
  goBack,
}: {
  method: Method;
  invoice: any;
  config: any;
  breakdown: ReturnType<
    typeof calculatePaymentFee
  > | null;
  busy: boolean;
  message: string;
  refValue: string;
  setRef: (v: string) => void;
  submit: () => void;
  payRazorpay: () => void;
  payPayPal: () => void;
  openWise: () => void;
  razorpayReady: boolean;
  goBack: () => void;
}) {
  const titles: Record<
    Method,
    string
  > = {
    RAZORPAY:
      "Pay securely with Razorpay",

    PAYPAL:
      "Pay with PayPal",

    WISE:
      "Pay with Wise",

    BANK_TRANSFER:
      "Bank Transfer",

    UPI:
      "Pay with UPI",
  };

  const descriptions: Record<
    Method,
    string
  > = {
    RAZORPAY:
      "Complete your payment securely through Razorpay.",

    PAYPAL:
      "Complete your payment securely through PayPal.",

    WISE:
      "Use the official Wise Business payment page.",

    BANK_TRANSFER:
      "Transfer the fee to one of our HDFC Bank accounts.",

    UPI:
      "Pay directly using one of our official UPI IDs.",
  };

  const icon =
    method === "RAZORPAY"
      ? "R"
      : method === "PAYPAL"
      ? "P"
      : method === "WISE"
      ? "W"
      : method ===
        "BANK_TRANSFER"
      ? "B"
      : "U";

  const bankAccounts = Array.isArray(config?.banks)
    ? config.banks
    : [];

  const upiIds = Array.isArray(config?.upiIds)
    ? config.upiIds
    : [];

  return (
    <div className="methodScreen">

      <button
        className="backPaymentButton"
        onClick={goBack}
      >
        ← Back to payment methods
      </button>

      <div className="methodScreenHeader">

        <div className="paymentMethodIcon large">
          {icon}
        </div>

        <div>

          <div className="paymentEyebrow">
            PAYMENT METHOD
          </div>

          <h2>
            {titles[method]}
          </h2>

          <p>
            {descriptions[method]}
          </p>

        </div>

      </div>

      {/* FEE BREAKDOWN */}

      {breakdown && (
        <div className="methodAmountBar">

          <div className="paymentBreakdown">

            <div className="paymentBreakdownRow">

              <span>
                Class Fee
              </span>

              <strong>
                {formatPaymentAmount(
                  breakdown.currency,
                  breakdown.baseAmount
                )}
              </strong>

            </div>

            <div className="paymentBreakdownRow">

              <span>
                Payment Processing Fee
              </span>

              <strong>
                {formatPaymentAmount(
                  breakdown.currency,
                  breakdown.processingFee
                )}
              </strong>

            </div>

            <div className="paymentBreakdownDivider" />

            <div className="paymentBreakdownRow paymentBreakdownTotal">

              <span>
                Total to Pay
              </span>

              <strong>
                {formatPaymentAmount(
                  breakdown.currency,
                  breakdown.totalAmount
                )}
              </strong>

            </div>

          </div>

        </div>
      )}

      {/* RAZORPAY */}

      {method ===
        "RAZORPAY" && (
        <div className="methodContentCard">

          <div className="methodInfo">

            <b>
              Razorpay Secure Checkout
            </b>

            <p>
              Your payment will be
              processed through Razorpay.
              The checkout amount includes
              the payment processing cost.
            </p>

          </div>

          <button
            className="btn btnGold methodPrimaryButton"
            disabled={
              busy ||
              !razorpayReady
            }
            onClick={
              payRazorpay
            }
          >

            {busy
              ? "Opening Secure Checkout…"
              : razorpayReady
              ? "PAY FULL AMOUNT WITH RAZORPAY →"
              : "LOADING SECURE CHECKOUT…"}

          </button>

        </div>
      )}

      {/* PAYPAL */}

      {method ===
        "PAYPAL" && (
        <div className="methodContentCard">

          <div className="methodInfo">

            <b>
              PayPal Secure Payment
            </b>

            <p>
              Your PayPal checkout will
              be created for the full
              amount shown above, including
              the payment processing cost.
            </p>

          </div>

          <button
            type="button"
            className="btn btnGold methodPrimaryButton"
            disabled={busy}
            onClick={
              payPayPal
            }
          >

            {busy
              ? "OPENING PAYPAL…"
              : "PAY FULL AMOUNT WITH PAYPAL →"}

          </button>

        </div>
      )}

      {/* WISE */}

      {method ===
        "WISE" && (
        <div className="methodContentCard">

          <div className="methodInfo">

            <b>
              Wise Business Payment
            </b>

            <p>
              The Wise payment page will
              open with the total amount,
              currency and payment
              description already filled in.
            </p>

          </div>

          {config.wisePaymentLink && (
            <button
              type="button"
              className="btn btnGold methodPrimaryButton"
              disabled={busy}
              onClick={
                openWise
              }
            >
              CONTINUE TO WISE →
            </button>
          )}

          {!config.wisePaymentLink && (
            <div className="notice paymentMessage">
              Wise payment link is not
              configured.
            </div>
          )}

          <ManualBox
            method="WISE"
            refValue={refValue}
            setRef={setRef}
            submit={submit}
            busy={busy}
          />

        </div>
      )}

      {/* BANK TRANSFER */}

      {method ===
        "BANK_TRANSFER" && (
        <div className="methodContentCard">

          <div className="methodInfo">

            <b>
              Bank Transfer Instructions
            </b>

            <p>
              Transfer the exact fee amount
              to one of the accounts below.
              After completing the transfer,
              submit your transaction
              reference.
            </p>

          </div>

          <div className="bankGrid">

            {bankAccounts.length === 0 ? (
              <div className="notice paymentMessage">
                Bank account details are not configured.
              </div>
            ) : (
              bankAccounts.map(
              (
                b: any,
                i: number
              ) => (
                <div
                  className="bankCard"
                  key={i}
                >

                  <b>
                    {b.name}
                  </b>

                  <div>
                    Account Holder:{" "}
                    <strong>
                      {b.holder}
                    </strong>
                  </div>

                  <div>
                    Account Number:{" "}
                    <strong>
                      {b.account}
                    </strong>
                  </div>

                  <div>
                    IFSC:{" "}
                    <strong>
                      {b.ifsc}
                    </strong>
                  </div>

                  {b.branch && (
                    <div>
                      Branch:{" "}
                      <strong>
                        {b.branch}
                      </strong>
                    </div>
                  )}

                  {b.type && (
                    <div>
                      Account Type:{" "}
                      <strong>
                        {b.type}
                      </strong>
                    </div>
                  )}

                </div>
              )
              )
            )}

          </div>

          <ManualBox
            method="BANK_TRANSFER"
            refValue={refValue}
            setRef={setRef}
            submit={submit}
            busy={busy}
          />

        </div>
      )}

      {/* UPI */}

      {method ===
        "UPI" && (
        <div className="methodContentCard">

          <div className="methodInfo">

            <b>
              UPI Payment
            </b>

            <p>
              Complete the payment using
              one of the official UPI IDs
              below. After payment, submit
              your transaction reference.
            </p>

          </div>

          <div className="upiList">

            {upiIds.length === 0 ? (
              <div className="notice paymentMessage">
                UPI payment details are not configured.
              </div>
            ) : (
              upiIds.map(
              (id: string) => (
                <div
                  className="copyRow"
                  key={id}
                >

                  <span>
                    {id}
                  </span>

                  <button
                    className="btn btnGhost"
                    onClick={() =>
                      navigator.clipboard?.writeText(
                        id
                      )
                    }
                  >
                    Copy
                  </button>

                </div>
              )
              )
            )}

          </div>

          <ManualBox
            method="UPI"
            refValue={refValue}
            setRef={setRef}
            submit={submit}
            busy={busy}
          />

        </div>
      )}

      {message && (
        <div className="notice paymentMessage">
          {message}
        </div>
      )}

    </div>
  );
}

function ManualBox({
  method,
  refValue,
  setRef,
  submit,
  busy,
}: {
  method: string;
  refValue: string;
  setRef: (v: string) => void;
  submit: () => void;
  busy: boolean;
}) {
  return (
    <div className="manualPaymentBox">

      <label>
        Payment reference /
        tracking number
      </label>

      <input
        placeholder={`${method} transaction or reference number`}
        value={refValue}
        onChange={(e) =>
          setRef(e.target.value)
        }
      />

      <button
        className="btn btnPrimary"
        onClick={submit}
        disabled={busy}
      >
        {busy
          ? "Submitting…"
          : "SUBMIT PAYMENT DETAILS"}
      </button>

    </div>
  );
}
