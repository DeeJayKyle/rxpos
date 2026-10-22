// Hand-drawn style illustrations for the idle screen: one for each kind of medicine, and one for each health-tip topic.
// Plain inline SVG (no image files), drawn in white and soft tints so they sit on any of the card colours.
const W = 'rgba(255,255,255,.96)', S = 'rgba(255,255,255,.55)', F = 'rgba(255,255,255,.22)', INK = 'rgba(15,23,42,.55)';

const Shadow = () => <ellipse cx="110" cy="196" rx="62" ry="9" fill="rgba(0,0,0,.18)" />;

function Blister() {
  return (
    <g>
      <Shadow />
      <rect x="38" y="46" width="144" height="128" rx="18" fill={W} transform="rotate(-8 110 110)" />
      <g transform="rotate(-8 110 110)">
        {[0, 1, 2].map((r) => [0, 1].map((c) => (
          <g key={r + '-' + c}>
            <ellipse cx={78 + c * 64} cy={78 + r * 36} rx="22" ry="13" fill={F} stroke={S} strokeWidth="2" />
            {!(r === 2 && c === 1) && <ellipse cx={78 + c * 64} cy={76 + r * 36} rx="15" ry="8" fill="currentColor" opacity=".85" />}
          </g>
        )))}
      </g>
      <ellipse cx="170" cy="168" rx="14" ry="8" fill="currentColor" transform="rotate(20 170 168)" />
    </g>
  );
}
function Capsules() {
  const cap = (x, y, r) => (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x="-40" y="-16" width="80" height="32" rx="16" fill={W} />
      <path d="M0 -16 H24 a16 16 0 0 1 0 32 H0 Z" fill="currentColor" />
      <rect x="-30" y="-9" width="22" height="5" rx="2.5" fill="rgba(255,255,255,.7)" />
    </g>
  );
  return <g><Shadow />{cap(92, 96, -30)}{cap(132, 140, 18)}{cap(70, 156, 62)}</g>;
}
function Bottle() {
  return (
    <g>
      <Shadow />
      <rect x="78" y="22" width="64" height="26" rx="6" fill={S} />
      <path d="M70 52 h80 v12 q16 10 16 34 v76 q0 18 -18 18 h-76 q-18 0 -18 -18 v-76 q0 -24 16 -34 z" fill={W} />
      <rect x="66" y="104" width="88" height="54" rx="8" fill="currentColor" opacity=".9" />
      <rect x="78" y="116" width="44" height="7" rx="3.5" fill="rgba(255,255,255,.85)" />
      <rect x="78" y="130" width="62" height="5" rx="2.5" fill="rgba(255,255,255,.55)" />
      <rect x="78" y="141" width="34" height="5" rx="2.5" fill="rgba(255,255,255,.55)" />
      <rect x="148" y="160" width="40" height="22" rx="4" fill={S} transform="rotate(12 168 171)" />
      <path d="M160 156 q10 -16 22 -6 l-8 14 z" fill="currentColor" opacity=".7" />
    </g>
  );
}
function Tube() {
  return (
    <g>
      <Shadow />
      <g transform="rotate(-24 110 110)">
        <path d="M44 84 h108 l18 14 v24 l-18 14 h-108 z" fill={W} />
        <rect x="170" y="98" width="22" height="24" rx="4" fill={S} />
        <path d="M44 84 l-8 8 v36 l8 8 z" fill={S} />
        <rect x="62" y="96" width="70" height="28" rx="6" fill="currentColor" opacity=".9" />
        <rect x="70" y="104" width="36" height="5" rx="2.5" fill="rgba(255,255,255,.85)" />
        <rect x="70" y="113" width="50" height="4" rx="2" fill="rgba(255,255,255,.55)" />
      </g>
      <path d="M150 54 q24 8 18 30" stroke={S} strokeWidth="5" fill="none" strokeLinecap="round" />
    </g>
  );
}
function Syringe() {
  return (
    <g>
      <Shadow />
      <g transform="rotate(-40 110 110)">
        <rect x="40" y="96" width="110" height="30" rx="6" fill={W} />
        <rect x="52" y="100" width="62" height="22" rx="3" fill="currentColor" opacity=".8" />
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={60 + i * 14} y="96" width="2.5" height="10" fill={INK} opacity=".35" />)}
        <rect x="150" y="104" width="22" height="14" rx="3" fill={S} />
        <rect x="172" y="109" width="34" height="4" rx="2" fill={W} />
        <rect x="16" y="104" width="26" height="14" rx="3" fill={S} />
        <rect x="6" y="94" width="10" height="34" rx="4" fill={W} />
      </g>
      <g transform="translate(150 132)"><rect x="0" y="0" width="34" height="50" rx="8" fill={W} /><rect x="6" y="-10" width="22" height="12" rx="3" fill={S} /><rect x="5" y="18" width="24" height="18" rx="3" fill="currentColor" opacity=".85" /></g>
    </g>
  );
}
function Inhaler() {
  return (
    <g>
      <Shadow />
      <rect x="92" y="24" width="44" height="104" rx="18" fill={W} transform="rotate(10 114 76)" />
      <path d="M70 120 h80 q8 0 8 8 v42 q0 10 -10 10 h-58 q-24 0 -24 -24 v-28 q0 -8 4 -8 z" fill={W} />
      <rect x="44" y="140" width="32" height="28" rx="8" fill="currentColor" opacity=".85" />
      <circle cx="40" cy="112" r="6" fill={S} /><circle cx="26" cy="96" r="4" fill={F} /><circle cx="46" cy="88" r="3" fill={F} />
    </g>
  );
}
function Sachet() {
  return (
    <g>
      <Shadow />
      <path d="M58 40 h104 l-4 8 4 8 v104 l-4 8 4 8 h-104 l4 -8 -4 -8 v-104 l4 -8 z" fill={W} transform="rotate(-6 110 110)" />
      <g transform="rotate(-6 110 110)">
        <rect x="74" y="72" width="72" height="56" rx="10" fill="currentColor" opacity=".88" />
        <path d="M110 84 q12 14 0 30 q-12 -16 0 -30z" fill="rgba(255,255,255,.9)" />
        <rect x="80" y="140" width="60" height="6" rx="3" fill={S} />
      </g>
      <circle cx="168" cy="160" r="16" fill={F} /><circle cx="176" cy="132" r="7" fill={F} />
    </g>
  );
}
function Bandage() {
  return (
    <g>
      <Shadow />
      <circle cx="96" cy="112" r="56" fill={W} /><circle cx="96" cy="112" r="20" fill="currentColor" opacity=".25" />
      <path d="M150 112 h46 v34 h-46 z" fill={W} />
      <g transform="rotate(30 150 70)"><rect x="118" y="56" width="72" height="26" rx="13" fill={S} /><rect x="142" y="56" width="24" height="26" fill="currentColor" opacity=".55" /></g>
    </g>
  );
}

const FORMS = [[/inject|infusion|vaccine|vial|ampoule/, Syringe], [/syrup|suspension|drop|lotion|liquid|mixture|elixir/, Bottle], [/cream|ointment|gel|cosmetic/, Tube],
  [/inhal|spray|puff/, Inhaler], [/capsule/, Capsules], [/sachet|powder|ors|granule/, Sachet], [/surgical|device|sundr|bandage|gauze|plaster/, Bandage]];

/** Picture of a medicine from its form (or its own photo when the pharmacy added one) */
export function ProductArt({ p, size = 220 }) {
  if (p.image) return <img className="spot-photo" src={p.image} alt={p.name} />;
  const text = `${p.form || ''} ${p.name || ''}`.toLowerCase();
  const Art = (FORMS.find(([re]) => re.test(text)) || [null, Blister])[1];
  return <svg width={size} height={size} viewBox="0 0 220 220" role="img" aria-label={p.form || 'Medicine'}><Art /></svg>;
}

// ---------- health tips ----------
function Net() { return <g><Shadow /><path d="M40 70 q70 -40 140 0 v96 q-70 24 -140 0z" fill={F} stroke={W} strokeWidth="3" />{[60, 80, 100, 120, 140, 160].map((x) => <path key={x} d={`M${x} 56 v120`} stroke={S} strokeWidth="1.6" />)}{[86, 106, 126, 146].map((y) => <path key={y} d={`M40 ${y} h140`} stroke={S} strokeWidth="1.6" />)}<rect x="62" y="140" width="96" height="28" rx="12" fill={W} /><circle cx="84" cy="146" r="10" fill="currentColor" /><g transform="translate(176 46)"><ellipse rx="8" ry="4" fill={INK} /><path d="M-2 -2 l-10 -10 M2 -2 l10 -10" stroke={INK} strokeWidth="2" /></g></g>; }
function Hands() { return <g><Shadow /><path d="M64 170 q-20 -50 6 -96 q8 -10 16 0 v40 l6 -64 q4 -10 12 0 l2 60 l8 -66 q6 -10 12 0 l-2 68 l12 -50 q6 -8 12 2 l-8 70 q-6 36 -40 42 z" fill={W} />{[[150, 60, 14], [172, 92, 9], [140, 104, 7], [168, 128, 11]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={F} stroke={W} strokeWidth="2" />)}</g>; }
function Water() { return <g><Shadow /><path d="M72 60 h76 l-10 120 q-1 10 -11 10 h-34 q-10 0 -11 -10 z" fill={F} stroke={W} strokeWidth="4" /><path d="M78 110 h64 l-6 68 q-1 6 -7 6 h-38 q-6 0 -7 -6 z" fill="currentColor" opacity=".7" /><path d="M160 36 q18 24 0 40 q-18 -16 0 -40z" fill={W} /><circle cx="98" cy="140" r="5" fill={S} /><circle cx="118" cy="160" r="3.5" fill={S} /></g>; }
function Heart() { return <g><Shadow /><path d="M110 178 q-78 -48 -66 -100 q12 -36 50 -26 q12 4 16 16 q4 -12 16 -16 q38 -10 50 26 q12 52 -66 100z" fill={W} /><path d="M52 112 h34 l10 -22 l14 44 l12 -30 l8 8 h40" stroke="currentColor" strokeWidth="6" fill="none" strokeLinejoin="round" strokeLinecap="round" /></g>; }
function Fruit() { return <g><Shadow /><circle cx="92" cy="128" r="50" fill={W} /><path d="M92 80 q4 -24 22 -30" stroke={S} strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M104 66 q24 -16 40 4 q-22 12 -40 -4z" fill="currentColor" opacity=".8" /><circle cx="154" cy="150" r="30" fill={S} /><circle cx="154" cy="150" r="20" fill="currentColor" opacity=".55" /><circle cx="72" cy="112" r="10" fill="rgba(255,255,255,.6)" /></g>; }
function Walk() { return <g><Shadow /><circle cx="118" cy="44" r="16" fill={W} /><path d="M114 64 l-14 48 l-24 30 M104 92 l30 18 l10 36 M110 76 l-26 14 M118 74 l20 18 l18 -4" stroke={W} strokeWidth="13" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M40 178 h140" stroke={S} strokeWidth="4" strokeDasharray="10 10" /></g>; }
function Moon() { return <g><Shadow /><path d="M136 40 a64 64 0 1 0 50 104 a52 52 0 0 1 -50 -104z" fill={W} /><circle cx="60" cy="56" r="4" fill={W} /><circle cx="178" cy="48" r="3" fill={W} /><circle cx="168" cy="86" r="5" fill={S} /><path d="M54 92 l4 8 l8 2 l-8 3 l-4 8 l-3 -8 l-8 -3 l8 -2z" fill={S} /></g>; }
function Shield() { return <g><Shadow /><path d="M110 30 l62 22 v48 q0 56 -62 82 q-62 -26 -62 -82 v-48z" fill={W} /><path d="M86 108 l18 18 l34 -38" stroke="currentColor" strokeWidth="11" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>; }
function Baby() { return <g><Shadow /><circle cx="110" cy="96" r="50" fill={W} /><circle cx="92" cy="96" r="5" fill={INK} /><circle cx="128" cy="96" r="5" fill={INK} /><path d="M98 116 q12 10 24 0" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" /><path d="M104 46 q8 -14 18 -4" stroke={W} strokeWidth="6" fill="none" strokeLinecap="round" /><circle cx="80" cy="110" r="7" fill="currentColor" opacity=".35" /><circle cx="140" cy="110" r="7" fill="currentColor" opacity=".35" /><rect x="70" y="150" width="80" height="34" rx="16" fill={S} /></g>; }
function Pills() { return <Bottle />; }

const TOPICS = [[/mosquito|malaria|net\b/, Net], [/wash|hands|soap|hygiene|toilet/, Hands], [/water|ors|diarrh|drink|hydrat/, Water], [/blood pressure|heart|salt|stroke|smok|alcohol/, Heart],
  [/fruit|vegetable|eat|food|sugar|diet/, Fruit], [/active|walk|exercise|minutes|weight/, Walk], [/sleep|rest|mental|stress/, Moon], [/vaccin|immunis|hiv|test|condom|screen/, Shield],
  [/child|baby|breast|pregnan|mother/, Baby]];
export function TipArt({ text, size = 220 }) {
  const t = String(text).toLowerCase();
  const Art = (TOPICS.find(([re]) => re.test(t)) || [null, Pills])[1];
  return <svg width={size} height={size} viewBox="0 0 220 220" role="img" aria-hidden="true"><Art /></svg>;
}
