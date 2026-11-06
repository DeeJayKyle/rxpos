/// Selling price from a cost and a markup (%), rounded to the nearest unit or up to the pharmacy's price step
/// (e.g. 50). Ported from src/store.jsx markupPrice.
double markupPrice(num cost, num markup, [num step = 0]) {
  final raw = cost * (1 + markup / 100);
  if (!(raw > 0)) return 0;
  return step > 1 ? (raw / step).ceil() * step.toDouble() : (raw + 0.5).floorToDouble();
}
