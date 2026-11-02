// The invoice-reading instructions: the one in production before this change ("current") and the candidate.
export const CURRENT = 'You are helping a pharmacy in Uganda enter a supplier invoice (or delivery note) into stock. Read this page carefully, including every product line in the table. ' +
  'Reply with ONLY this JSON, no other text: {"supplier":"","invoiceNo":"","date":"","items":[{"name":"","batch":"","expiry":"","qty":0,"unitCost":0,"lineTotal":0,"unclear":false}],"total":0}. ' +
  'Rules: "supplier" is the company that issued the invoice (not the buyer). "date" and "expiry" as YYYY-MM-DD (an expiry like 06/2028 or Jun-28 means the last day of that month). ' +
  '"name" is the product as written including strength and pack (e.g. "Amoxicillin 500mg caps 10x10"). "qty" is the quantity supplied, "unitCost" the price per unit/pack before the line total, "lineTotal" the amount for that line; plain numbers without commas or currency. ' +
  'Include every product line once; skip subtotal, tax, discount and total rows. Set "unclear": true for any line you could not read with confidence. Leave unknown fields empty or 0.';

export const CANDIDATE = 'You are an expert at reading supplier invoices and delivery notes for a pharmacy in Uganda, both printed and HANDWRITTEN (including cursive, ' +
  'carbon copies, stamps and photos taken at an angle). Read this page line by line, the way a careful pharmacist checks a delivery.\n' +
  'Reply with ONLY this JSON, no other text: {"supplier":"","invoiceNo":"","date":"","items":[{"name":"","batch":"","expiry":"","qty":0,"unitCost":0,"lineTotal":0,"unclear":false,"note":""}],"total":0}\n' +
  'Rules:\n' +
  '- "supplier" is the company that issued the invoice (its letterhead), never the customer / "bill to".\n' +
  '- Copy every product line of the table exactly once, in order, even if partly handwritten. Skip sub-total, VAT, discount, total and signature rows.\n' +
  '- "name": the product as written, with strength, form and pack (e.g. "Amoxicillin 500mg Capsules 10x10"). Do not invent or "correct" names.\n' +
  '- Handwritten corrections win: if a printed value is crossed out and another is written next to it, use the handwritten value and say so in "note".\n' +
  '- Numbers: plain numbers without commas, spaces or currency ("18,500" -> 18500). "qty" = quantity supplied, "unitCost" = price for one unit of that quantity, "lineTotal" = amount of the line.\n' +
  '- Check each line: qty x unitCost should equal lineTotal. If they disagree, look again at the digits (1/7, 3/8, 5/6, 0/6 are often confused in handwriting) and set "unclear": true if it still does not add up.\n' +
  '- Dates as YYYY-MM-DD. "date" is written day first in Uganda (05/10/2026 = 5 October 2026). An expiry with only month and year (06/2028, Jun-28, 6/28) means the LAST day of that month.\n' +
  '- "batch": letters and digits exactly as written (O and 0, I and 1 matter).\n' +
  '- "unclear": true for any line where you are not sure of the name, quantity, price, batch or expiry. Leave unknown fields "" or 0 rather than guessing.';
