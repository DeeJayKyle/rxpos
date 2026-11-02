// What the models are asked when reading a supplier invoice page (measured with tools/invoice-eval: typed,
// handwritten, corrected and photographed invoices). Kept in one place so the check and the cloud use the same words.
export const INVOICE_PROMPT = 'You are an expert at reading supplier invoices and delivery notes for a pharmacy in Uganda, both printed and HANDWRITTEN (including cursive, ' +
  'carbon copies, stamps and photos taken at an angle). Read this page line by line, the way a careful pharmacist checks a delivery.\n' +
  'Reply with ONLY this JSON, no other text: {"supplier":"","invoiceNo":"","date":"","items":[{"name":"","batch":"","expiry":"","qty":0,"unitCost":0,"lineTotal":0,"unclear":false,"note":""}],"total":0}\n' +
  'Rules:\n' +
  '- "supplier" is the company that issued the invoice (its letterhead), never the customer / "bill to".\n' +
  '- Copy every product line of the table exactly once, in order, even if partly handwritten. Skip sub-total, VAT, discount, total and signature rows.\n' +
  '- "name": the product as written, with strength, form and pack (e.g. "Amoxicillin 500mg Capsules 10x10"). Do not invent or "correct" names.\n' +
  '- Handwritten corrections win: if a printed value is crossed out and another is written next to it, use the handwritten value and say so in "note".\n' +
  '- Numbers: plain numbers without commas, spaces or currency ("18,500" -> 18500). "qty" = quantity supplied, "unitCost" = price for one unit of that quantity, "lineTotal" = amount of the line.\n' +
  '- Check each line: qty x unitCost should equal lineTotal. If they disagree, look again at the digits (1/7, 3/8, 5/6, 0/6 are often confused in handwriting) and set "unclear": true if it still does not add up.\n' +
  '- Dates: copy "date" and "expiry" EXACTLY as written (e.g. "28/10/2026", "06/2028", "Nov-27", "Feb 2028"); do not convert them.\n' +
  '- "batch": letters and digits exactly as written. Look closely at each character: O or 0, I or 1, S or 5, B or 8, Z or 2. Batch codes usually start with letters and end with digits.\n' +
  '- "unclear": true for any line where you are not sure of the name, quantity, price, batch or expiry. Leave unknown fields "" or 0 rather than guessing.';
