import { jsPDF } from "jspdf";

export function makeInvoicePdf(input: {
  invoiceNumber: string; studentName: string; parentName?: string|null;
  monthLabel: string; amount: string; currency: string; paidAt: string;
}) {
  // jsPDF works server-side in Node for basic text documents.
  const doc = new jsPDF();
  doc.setFillColor(7,31,73);
  doc.rect(0,0,210,34,"F");
  doc.setTextColor(255,255,255);
  doc.setFontSize(18);
  doc.text("GLOBAL PUNJABI CLASSES", 18, 21);

  doc.setTextColor(18,32,58);
  doc.setFontSize(24);
  doc.text("PAID INVOICE", 18, 55);
  doc.setFontSize(11);
  doc.text(`Invoice No: ${input.invoiceNumber}`, 18, 67);
  doc.text(`Payment Date: ${new Date(input.paidAt).toLocaleDateString()}`, 18, 74);

  doc.setFontSize(12);
  doc.text(`Student: ${input.studentName}`, 18, 94);
  if (input.parentName) doc.text(`Parent: ${input.parentName}`, 18, 102);
  doc.text(`Fee Month: ${input.monthLabel}`, 18, 110);

  doc.setFillColor(246,248,252);
  doc.roundedRect(15,125,180,38,5,5,"F");
  doc.setTextColor(100,116,139);
  doc.setFontSize(10);
  doc.text("TOTAL PAID", 22, 140);
  doc.setTextColor(7,31,73);
  doc.setFontSize(20);
  doc.text(`${input.currency} ${input.amount}`, 22, 153);

  doc.setTextColor(22,101,52);
  doc.setFontSize(14);
  doc.text("STATUS: PAID", 18, 184);

  doc.setTextColor(100,116,139);
  doc.setFontSize(9);
  doc.text("Thank you for choosing Global Punjabi Classes.", 18, 198);
  doc.text("globalpunjabiclasses.com", 18, 205);
  return Buffer.from(doc.output("arraybuffer"));
}
