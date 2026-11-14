// Live clinical safety check of a sale (the pill above the cart): the customer's recorded allergies, the same medicine
// or class twice, and a short list of well-established, clinically important interactions. Pure and offline (no
// network, nothing written); a prompt for the pharmacist's own judgement, never a block. The Flutter app has the same
// rules in rxpos_flutter/lib/core/rules/clinical.dart.
import { drugClassOf } from './drugclass.js';

const lc = (s) => String(s || '').toLowerCase();
const textOf = (p) => ` ${lc(p.generic)} ${lc(p.name)} `.replace(/[^a-z0-9/\- ]+/g, ' ');
const hasAny = (text, stems) => stems.some((s) => text.includes(s));

// [group, stems]: the groups the interaction and allergy rules talk about
const GROUPS = {
  warfarin: ['warfarin', 'acenocoumarol'],
  nsaid: ['diclofenac', 'ibuprofen', 'naproxen', 'piroxicam', 'meloxicam', 'indomethacin', 'ketoprofen', 'aceclofenac', 'celecoxib', 'etoricoxib', 'mefenamic', 'nimesulide', 'ketorolac', 'aspirin', 'acetylsalicylic'],
  inrRaisers: ['metronidazole', 'fluconazole', 'cotrimoxazole', 'co-trimoxazole', 'sulfamethoxazole', 'ciprofloxacin', 'erythromycin', 'clarithromycin', 'miconazole'],
  methotrexate: ['methotrexate'],
  trimethoprim: ['cotrimoxazole', 'co-trimoxazole', 'trimethoprim', 'septrin'],
  pde5: ['sildenafil', 'tadalafil', 'vardenafil'],
  nitrate: ['glyceryl trinitrate', 'nitroglycerin', 'isosorbide'],
  rifampicin: ['rifampicin', 'rifampin', 'rifabutin'],
  hormonalContraceptive: ['levonorgestrel', 'ethinylestradiol', 'ethinyl estradiol', 'norethisterone', 'desogestrel', 'etonogestrel', 'microgynon', 'postinor'],
  arvRifampicin: ['nevirapine', 'dolutegravir', 'lopinavir', 'atazanavir'],
  tramadol: ['tramadol'],
  serotonergic: ['fluoxetine', 'sertraline', 'paroxetine', 'citalopram', 'escitalopram', 'amitriptyline', 'clomipramine'],
  aceArb: ['enalapril', 'lisinopril', 'captopril', 'ramipril', 'perindopril', 'losartan', 'valsartan', 'telmisartan', 'candesartan'],
  potassium: ['spironolactone', 'amiloride', 'potassium chloride', 'triamterene'],
  simvastatin: ['simvastatin', 'lovastatin'],
  strongCyp3a4: ['clarithromycin', 'erythromycin', 'ketoconazole', 'itraconazole'],
  chelatable: ['ciprofloxacin', 'levofloxacin', 'norfloxacin', 'ofloxacin', 'doxycycline', 'tetracycline'],
  polyvalent: ['antacid', 'aluminium hydroxide', 'magnesium hydroxide', 'magnesium trisilicate', 'ferrous', 'iron', 'zinc', 'calcium carbonate'],
  theophylline: ['theophylline', 'aminophylline'],
  theophyllineRaisers: ['ciprofloxacin', 'erythromycin', 'clarithromycin'],
  lithium: ['lithium'],
  opioid: ['morphine', 'pethidine', 'codeine', 'tramadol', 'fentanyl', 'methadone', 'dihydrocodeine'],
  benzodiazepine: ['diazepam', 'lorazepam', 'alprazolam', 'clonazepam', 'midazolam', 'bromazepam', 'nitrazepam'],
};
/** [group A, group B, level, what to tell the pharmacist] */
const INTERACTIONS = [
  ['warfarin', 'nsaid', 'major', 'bleeding risk (anticoagulant with an NSAID or aspirin)'],
  ['warfarin', 'inrRaisers', 'major', 'raises the INR: bleeding risk (anticoagulant with an antibiotic / antifungal)'],
  ['methotrexate', 'trimethoprim', 'major', 'bone-marrow toxicity (methotrexate with trimethoprim / co-trimoxazole)'],
  ['methotrexate', 'nsaid', 'caution', 'raises methotrexate levels (methotrexate with an NSAID)'],
  ['pde5', 'nitrate', 'major', 'severe low blood pressure (sildenafil-type with a nitrate)'],
  ['rifampicin', 'hormonalContraceptive', 'major', 'the contraceptive may fail (rifampicin): advise another method'],
  ['rifampicin', 'arvRifampicin', 'caution', 'rifampicin lowers this ARV: the dose may need changing'],
  ['tramadol', 'serotonergic', 'major', 'serotonin syndrome and seizure risk (tramadol with an antidepressant)'],
  ['aceArb', 'potassium', 'caution', 'high potassium risk (ACE inhibitor / ARB with a potassium-sparing drug)'],
  ['simvastatin', 'strongCyp3a4', 'major', 'muscle damage risk (simvastatin with clarithromycin / azole)'],
  ['chelatable', 'polyvalent', 'caution', 'absorption blocked: take the antibiotic 2 hours before or 6 hours after antacids, iron or zinc'],
  ['theophylline', 'theophyllineRaisers', 'caution', 'theophylline toxicity (with ciprofloxacin / a macrolide)'],
  ['lithium', 'nsaid', 'major', 'lithium toxicity (lithium with an NSAID)'],
  ['opioid', 'benzodiazepine', 'major', 'breathing can slow dangerously (opioid with a benzodiazepine)'],
];
/** What an allergy note says → the groups it rules out [words in the note, stems in the medicine, level, label] */
const ALLERGY_CLASSES = [
  [['penicillin', 'amoxil', 'amoxicillin', 'ampicillin', 'augmentin', 'cloxacillin'], ['penicillin', 'amoxicillin', 'ampicillin', 'cloxacillin', 'flucloxacillin', 'piperacillin', 'benzathine', 'phenoxymethyl', 'augmentin', 'co-amoxiclav'], 'major', 'penicillin allergy'],
  [['penicillin', 'amoxil', 'amoxicillin'], ['cef', 'ceph'], 'caution', 'penicillin allergy: possible cross-reaction with cephalosporins'],
  [['sulfa', 'sulpha', 'sulfonamide', 'sulphonamide', 'septrin', 'cotrimoxazole', 'co-trimoxazole', 'fansidar'], ['cotrimoxazole', 'co-trimoxazole', 'sulfamethoxazole', 'sulfadoxine', 'septrin', 'sulfasalazine', 'fansidar'], 'major', 'sulfa allergy'],
  [['nsaid', 'aspirin', 'ibuprofen', 'diclofenac', 'brufen'], GROUPS.nsaid, 'major', 'NSAID / aspirin allergy'],
  [['quinine'], ['quinine'], 'major', 'quinine allergy'],
  [['chloroquine'], ['chloroquine', 'hydroxychloroquine'], 'major', 'chloroquine allergy'],
];
const ALLERGY_STOP = new Set(['allergy', 'allergic', 'allergies', 'none', 'nil', 'known', 'drug', 'drugs', 'with', 'reaction', 'rash', 'to', 'and', 'the', 'tablets', 'tablet', 'syrup']);

/**
 * The findings for a cart. lines: [{ id, name }], products: the medicine records (generic, name, category), customer:
 * the chosen customer (or null). Returns { level: 'ok' | 'caution' | 'major', findings: [{ level, kind, text, ids }] }.
 */
export function safetyCheck(lines, products, customer) {
  const items = [];
  const seen = new Set();
  for (const l of lines || []) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    const p = (products || []).find((x) => x.id === l.id) || l;
    items.push({ id: l.id, name: p.name || l.name || '', text: textOf(p), generic: lc(p.generic).trim(), cls: drugClassOf(p).cls });
  }
  const findings = [];
  const add = (level, kind, text, ids) => { if (!findings.some((f) => f.text === text)) findings.push({ level, kind, text, ids }); };

  // allergies recorded for the customer
  const note = lc(customer?.allergies).trim();
  if (note && !/^(none|nil|nkda|no known)/.test(note)) {
    for (const it of items) {
      for (const [words, stems, level, label] of ALLERGY_CLASSES) {
        if (hasAny(note, words) && hasAny(it.text, stems)) add(level, 'allergy', `${it.name}: ${label} recorded for ${customer.name || 'this customer'}`, [it.id]);
      }
      // a medicine named in the note itself ("metronidazole – rash"), when no class rule already caught it
      if (findings.some((f) => f.kind === 'allergy' && f.ids[0] === it.id)) continue;
      for (const w of note.split(/[^a-z0-9-]+/).filter((x) => x.length >= 5 && !ALLERGY_STOP.has(x))) {
        if (it.text.includes(' ' + w) || it.generic === w) add('major', 'allergy', `${it.name}: "${w}" allergy recorded for ${customer.name || 'this customer'}`, [it.id]);
      }
    }
  }
  // the same ingredient twice, or two of a class that shouldn't be doubled up
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.generic && a.generic === b.generic) add('caution', 'duplicate', `Same medicine twice: ${a.name} and ${b.name} (${a.generic})`, [a.id, b.id]);
    else if (a.cls === b.cls && ['NSAIDs', 'Penicillins', 'Benzodiazepines', 'Opioid analgesics', 'Anticoagulants & antiplatelets'].includes(a.cls)) add('caution', 'duplicate', `Two ${a.cls}: ${a.name} and ${b.name}`, [a.id, b.id]);
  }
  // interactions between two different lines
  for (const [ga, gb, level, why] of INTERACTIONS) {
    const A = items.filter((x) => hasAny(x.text, GROUPS[ga])), B = items.filter((x) => hasAny(x.text, GROUPS[gb]));
    for (const a of A) for (const b of B) if (a.id !== b.id) add(level, 'interaction', `${a.name} + ${b.name}: ${why}`, [a.id, b.id]);
  }
  const order = { major: 0, caution: 1 };
  findings.sort((x, y) => order[x.level] - order[y.level]);
  return { level: findings.some((f) => f.level === 'major') ? 'major' : findings.length ? 'caution' : 'ok', findings };
}
