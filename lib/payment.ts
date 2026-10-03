    update,
    safeProviderFields(
      input.method,
      input.providerFields
    )
  );

  const {
    data: updatedGroup,
    error: updateError,
  } =
    await supabaseAdmin
      .from("payment_groups")
      .update(update)
      .eq("id", groupId)
      .neq("status", "PAID")
      .select("*")
      .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  const finalGroup =
    updatedGroup || group;

  /**
   * Now mark each individual invoice as paid.
   *
   * IMPORTANT:
   * We pass the actual invoice amount for each child.
   * The group itself has already been verified against
   * the provider's TOTAL payment.
   */
  for (
    const item of
      group.payment_group_items || []
  ) {
    const invoice =
      item.fee_invoices;

    if (!invoice) {
      continue;
    }

    await markInvoicePaid(
      item.invoice_id,
      {
        method:
          input.method,

        transactionId:
          input.transactionId,

        actor:
          input.actor,

        /**
         * Each individual invoice must match
         * its own amount/currency.
         *
         * For a group payment, this is the internal
         * allocation amount, not the provider total.
         */
        providerAmount:
          invoice.amount,

        providerCurrency:
          invoice.currency,

        providerFields:
          input.providerFields,

        skipProviderAmountVerification:
          true,
      }
    );
  }

  await logAudit(
    "PAYMENT_GROUP_RECEIVED",
    "payment_group",
    groupId,
    input.actor,
    {
      method:
        input.method,

      transactionId:
        input.transactionId ||
        null,

      amount:
        normalizeMoney(
          group.amount
        ),

      currency:
        normalizeCurrency(
          group.currency
        ),
    }
  );

  return finalGroup;
}
