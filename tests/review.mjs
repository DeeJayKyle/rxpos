// Add Stock asks for a review before receiving (src/deliverychecks.js): tests that receive a delivery confirm it here.
// Returns the dialog's text ('' when none came up within ~5 s), after pressing its confirm button.
export async function confirmReview(page) {
  for (let k = 0; k < 35; k++) {
    const text = await page.evaluate(() => {
      const d = document.querySelector('.modal.dialog');
      if (!d || !/Receive this delivery\?|Check before receiving/.test(d.innerText)) return '';
      const t = d.innerText;
      d.querySelector('button.primary')?.click();
      return t;
    });
    if (text) return text;
    await new Promise((r) => setTimeout(r, 150));
  }
  return '';
}
