// Temporary worker for the invoice reading check (.github/workflows/invoice-eval.yml): runs a Workers AI model on
// fictional invoice images, behind a one-time key. Deployed under its own name for one run, then deleted.
export default {
  async fetch(req, env) {
    if (req.method !== 'POST' || req.headers.get('x-eval-key') !== env.EVAL_KEY) return new Response('no', { status: 403 });
    const { model, input } = await req.json();
    try { return Response.json({ success: true, result: await env.AI.run(model, input) }); }
    catch (e) { return Response.json({ success: false, errors: [{ message: String(e.message || e) }] }); }
  },
};
