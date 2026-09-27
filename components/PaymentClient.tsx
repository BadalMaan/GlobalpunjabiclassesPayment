"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

type Method = "RAZORPAY" | "PAYPAL" | "WISE" | "BANK_TRANSFER" | "UPI";

const METHODS: Method[] = [
  "RAZORPAY",
  "PAYPAL",
  "WISE",
  "BANK_TRANSFER",
  "UPI",
];

export default function PaymentClient({
  invoice,
  config,
}: {
  invoice: any;
  config: any;
}) {
  const [method, setMethod] = useState<Method | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ref, setRef] = useState("");
  const [paid, setPaid] = useState(invoice.status === "PAID");
  const [progress, setProgress] = useState(
    invoice.status === "PROCESSING" || invoice.status === "VERIFYING"
  );
  const [razorpayReady, setRazorpayReady] = useState(false);

  const names = invoice.studentNames || [];

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const selected = qs.get("method") as Method | null;

    if (selected && METHODS.includes(selected)) {
      setMethod(selected);
    }

    if (qs.get("paypal") === "success" && qs.get("token")) {
      setBusy(true);

      fetch(
        invoice.type === "group"
          ? "/api/payments/paypal/group-capture"
          : "/api/payments/paypal/capture",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: invoice.token,
            orderId: qs.get("token"),
          }),
        }
      )
        .then(async (r) => {
          if (r.ok) {
            setPaid(true);
          } else {
            const d = await r.json().catch(() => ({}));
            setMessage(d.error || "PayPal confirmation failed.");
          }
        })
        .finally(() => setBusy(false));
    }
  }, [invoice.token, invoice.type]);

  useEffect(() => {
    const onPopState = () => {
      const qs = new URLSearchParams(window.location.search);
      const selected = qs.get("method") as Method | null;

      setMethod(
        selected && METHODS.includes(selected) ? selected : null
      );
      setMessage("");
      setRef("");
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  function openMethod(next: Method) {
    setMethod(next);
    setMessage("");
    setRef("");

    const url = new URL(window.location.href);
    url.searchParams.set("method", next);

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

    const url = new URL(window.location.href);
    url.searchParams.delete("method");

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
    if (!method || !ref.trim()) {
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

    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: invoice.token,
        method,
        reference: ref.trim(),
      }),
    });

    const d = await r.json().catch(() => ({}));

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

    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: invoice.token,
      }),
    });

    const d = await r.json().catch(() => ({}));

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

    const rz = new window.Razorpay({
      key: d.key,
      amount: d.amount,
      currency: d.currency,
      name: "Global Punjabi Classes",
      description: `Monthly fee — ${names.join(" & ")}`,
      order_id: d.orderId,

      prefill: {
        name: "",
        email: "",
      },

      theme: {
        color: "#0b2a5b",
      },

      handler: async (response: any) => {
        const verify = await fetch(
          invoice.type === "group"
            ? "/api/payments/razorpay/group-verify"
            : "/api/payments/razorpay/verify",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              token: invoice.token,
              ...response,
            }),
          }
        );

        const vd = await verify
          .json()
          .catch(() => ({}));

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
          e?.error?.description ||
            "Razorpay payment failed."
        );
      }
    );

    rz.open();
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
            Your payment has been successfully
            received and verified.
          </p>

          <div className="paymentSuccessAmount">
            {invoice.currency} {invoice.amount}
          </div>

          <small>
            A receipt/invoice will be sent to
            the registered email address.
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
          setRazorpayReady(true)
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

          {invoice.items?.length > 0 && (
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
                      {invoice.currency}{" "}
                      {x.amount}
                    </b>
                  </div>
                )
              )}

            </div>
          )}

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
                    Choose a payment method
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
                    openMethod("RAZORPAY")
                  }
                />

                <MethodCard
                  icon="P"
                  title="PayPal"
                  description="Secure payment through PayPal."
                  onClick={() =>
                    openMethod("PAYPAL")
                  }
                />

                <MethodCard
                  icon="W"
                  title="Wise"
                  description="Pay using Wise Business."
                  onClick={() =>
                    openMethod("WISE")
                  }
                />

                <MethodCard
                  icon="B"
                  title="Bank Transfer"
                  description="Transfer the fee directly to our bank account."
                  onClick={() =>
                    openMethod("BANK_TRANSFER")
                  }
                />

                <MethodCard
                  icon="U"
                  title="UPI"
                  description="Pay directly using one of our official UPI IDs."
                  onClick={() =>
                    openMethod("UPI")
                  }
                />

              </div>

              <div className="paymentNotice">

                <span>
                  ✓
                </span>

                <div>

                  <b>
                    Payment verification
                  </b>

                  <p>
                    Online payments are
                    confirmed through the
                    payment provider. Bank
                    and UPI payments remain
                    under verification until
                    authorized confirmation.
                  </p>

                </div>

              </div>

            </>
          ) : (

            <MethodScreen
              method={method}
              invoice={invoice}
              config={config}
              busy={busy}
              message={message}
              refValue={ref}
              setRef={setRef}
              submit={manualSubmit}
              payRazorpay={payRazorpay}
              razorpayReady={razorpayReady}
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
  busy,
  message,
  refValue,
  setRef,
  submit,
  payRazorpay,
  razorpayReady,
  goBack,
}: {
  method: Method;
  invoice: any;
  config: any;
  busy: boolean;
  message: string;
  refValue: string;
  setRef: (v: string) => void;
  submit: () => void;
  payRazorpay: () => void;
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
      "Use the official PayPal payment page to make your payment.",

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
      : method === "BANK_TRANSFER"
      ? "B"
      : "U";

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

      <div className="methodAmountBar">

        <span>
          Amount to pay
        </span>

        <strong>
          {invoice.currency}{" "}
          {invoice.amount}
        </strong>

      </div>

      {/* RAZORPAY */}

      {method === "RAZORPAY" && (

        <div className="methodContentCard">

          <div className="methodInfo">

            <b>
              Razorpay Secure Checkout
            </b>

            <p>
              Your payment will be
              processed through Razorpay.
              The payment is verified on
              the server before your
              invoice is marked as received.
            </p>

          </div>

          <button
            className="btn btnGold methodPrimaryButton"
            disabled={
              busy ||
              !razorpayReady
            }
            onClick={payRazorpay}
          >

            {busy
              ? "Opening Secure Checkout…"
              : razorpayReady
              ? "PAY SECURELY WITH RAZORPAY →"
              : "LOADING SECURE CHECKOUT…"}

          </button>

        </div>

      )}

      {/* PAYPAL */}

      {method === "PAYPAL" && (

        <div className="methodContentCard">

          <div className="methodInfo">

            <b>
              PayPal Payment
            </b>

            <p>
              Use the official PayPal
              payment page. Because
              PayPal.Me does not provide
              automatic server-side payment
              confirmation, the payment will
              remain under verification until
              confirmed.
            </p>

          </div>

          <a
            className="btn btnGold methodPrimaryButton"
            href={
              config.paypalPaymentLink
            }
            target="_blank"
            rel="noreferrer"
          >
            CONTINUE TO PAYPAL →
          </a>

          <ManualBox
            method="PAYPAL"
            refValue={refValue}
            setRef={setRef}
            submit={submit}
            busy={busy}
          />

        </div>

      )}

      {/* WISE */}

      {method === "WISE" && (

        <div className="methodContentCard">

          <div className="methodInfo">

            <b>
              Wise Business Payment
            </b>

            <p>
              {config.wisePaymentLink
                ? "Open the official Wise payment page and complete the transfer."
                : "Wise payment instructions will appear here once the Wise Business payment link is configured."}
            </p>

          </div>

          {config.wisePaymentLink && (

            <a
              className="btn btnGold methodPrimaryButton"
              href={
                config.wisePaymentLink
              }
              target="_blank"
              rel="noreferrer"
            >
              CONTINUE TO WISE →
            </a>

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

      {method === "BANK_TRANSFER" && (

        <div className="methodContentCard">

          <div className="methodInfo">

            <b>
              Bank Transfer Instructions
            </b>

            <p>
              Transfer the exact fee
              amount to one of the
              accounts below. After
              completing the transfer,
              submit your transaction
              reference.
            </p>

          </div>

          <div className="bankGrid">

            {config.banks.map(
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

      {method === "UPI" && (

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

            {config.upiIds.map(
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
        Payment reference / tracking number
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
