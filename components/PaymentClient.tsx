
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
