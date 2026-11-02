// The invoice-reading instructions: the one in production before this change ("current") and the candidate.
export const CURRENT = 'You are helping a pharmacy in Uganda enter a supplier invoice (or delivery note) into stock. Read this page carefully, including every product line in the table. ' +
  'Reply with ONLY this JSON, no other text: {"supplier":"","invoiceNo":"","date":"","items":[{"name":"","batch":"","expiry":"","qty":0,"unitCost":0,"lineTotal":0,"unclear":false}],"total":0}. ' +
  'Rules: "supplier" is the company that issued the invoice (not the buyer). "date" and "expiry" as YYYY-MM-DD (an expiry like 06/2028 or Jun-28 means the last day of that month). ' +
  '"name" is the product as written including strength and pack (e.g. "Amoxicillin 500mg caps 10x10"). "qty" is the quantity supplied, "unitCost" the price per unit/pack before the line total, "lineTotal" the amount for that line; plain numbers without commas or currency. ' +
  'Include every product line once; skip subtotal, tax, discount and total rows. Set "unclear": true for any line you could not read with confidence. Leave unknown fields empty or 0.';

export { INVOICE_PROMPT as CANDIDATE } from '../../worker/invoiceprompt.js';
