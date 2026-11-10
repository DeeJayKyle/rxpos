// Drug classes for sorting, grouping and shelving (step 26, copied from the Flutter app's core/rules/drug_class.dart,
// the same rules: tool/parity checks both give the same class): the pharmacological class (e.g. "Penicillins") and the
// therapeutic area (e.g. "Anti-infectives") of a medicine. Its own "Category / class" wins when filled in; otherwise
// the class is worked out from the generic name (or the name). Nothing is written to the records.

/** Therapeutic areas, in the order lists and shelves show them */
export const THERAPEUTIC_AREAS = [
  'Anti-infectives', 'Antimalarials', 'Anti-TB', 'Antivirals & HIV', 'Antifungals', 'Antiparasitics & deworming',
  'Pain, fever & inflammation', 'Cardiovascular', 'Diabetes & hormones', 'Respiratory & allergy', 'Gastrointestinal',
  'Nervous system & mental health', 'Vitamins, minerals & nutrition', 'Fluids & electrolytes', 'Skin', 'Eye, ear & nose',
  "Women's health & family planning", 'Urology & men\'s health', 'Muscle & joint', 'Medical supplies', 'Other',
];
export const OTHER_AREA = 'Other', UNCLASSIFIED = 'Unclassified';

/** [stems found in the generic name or name, pharmacological class, therapeutic area]; the more specific first */
const RULES = [
  [['plaster', 'bandage', 'gauze', 'cotton wool', 'syringe', 'needle', 'cannula', 'glove', 'catheter', 'condom', 'test kit', 'strip', 'lancet', 'mask', 'giving set', 'suture', 'thermometer'], 'Medical supplies', 'Medical supplies'],
  // anti-infectives
  [['amoxicillin', 'ampicillin', 'cloxacillin', 'flucloxacillin', 'penicillin', 'benzathine', 'piperacillin', 'phenoxymethyl'], 'Penicillins', 'Anti-infectives'],
  [['cef', 'ceph'], 'Cephalosporins', 'Anti-infectives'],
  [['azithromycin', 'erythromycin', 'clarithromycin'], 'Macrolides', 'Anti-infectives'],
  [['ciprofloxacin', 'levofloxacin', 'norfloxacin', 'ofloxacin', 'moxifloxacin'], 'Fluoroquinolones', 'Anti-infectives'],
  [['doxycycline', 'tetracycline', 'oxytetracycline', 'minocycline'], 'Tetracyclines', 'Anti-infectives'],
  [['gentamicin', 'amikacin', 'streptomycin', 'kanamycin', 'neomycin'], 'Aminoglycosides', 'Anti-infectives'],
  [['cotrimoxazole', 'co-trimoxazole', 'sulfamethoxazole', 'trimethoprim', 'septrin'], 'Sulfonamides', 'Anti-infectives'],
  [['metronidazole', 'tinidazole', 'secnidazole', 'ornidazole'], 'Nitroimidazoles', 'Anti-infectives'],
  [['nitrofurantoin'], 'Urinary antiseptics', 'Anti-infectives'],
  [['clindamycin', 'lincomycin'], 'Lincosamides', 'Anti-infectives'],
  [['chloramphenicol'], 'Amphenicols', 'Anti-infectives'],
  [['vancomycin', 'meropenem', 'imipenem', 'linezolid'], 'Reserve antibiotics', 'Anti-infectives'],
  // antimalarials, TB, antivirals, antifungals, antiparasitics
  [['artemether', 'lumefantrine', 'artesunate', 'dihydroartemisinin', 'piperaquine', 'amodiaquine', 'quinine', 'chloroquine', 'primaquine', 'mefloquine', 'sulfadoxine', 'fansidar', 'proguanil', 'atovaquone'], 'Antimalarials', 'Antimalarials'],
  [['rifampicin', 'isoniazid', 'pyrazinamide', 'ethambutol', 'rifapentine'], 'Anti-TB medicines', 'Anti-TB'],
  [['tenofovir', 'lamivudine', 'dolutegravir', 'efavirenz', 'nevirapine', 'zidovudine', 'abacavir', 'lopinavir', 'ritonavir', 'atazanavir', 'emtricitabine'], 'Antiretrovirals', 'Antivirals & HIV'],
  [['acyclovir', 'aciclovir', 'valacyclovir', 'valaciclovir', 'oseltamivir'], 'Antivirals', 'Antivirals & HIV'],
  [['fluconazole', 'ketoconazole', 'itraconazole', 'clotrimazole', 'miconazole', 'griseofulvin', 'nystatin', 'terbinafine', 'econazole', 'tioconazole', 'whitfield'], 'Antifungals', 'Antifungals'],
  [['albendazole', 'mebendazole', 'levamisole', 'praziquantel', 'ivermectin', 'piperazine', 'pyrantel', 'niclosamide'], 'Anthelmintics', 'Antiparasitics & deworming'],
  [['permethrin', 'benzyl benzoate'], 'Scabicides', 'Skin'],
  // pain, fever and inflammation
  [['diclofenac', 'ibuprofen', 'naproxen', 'piroxicam', 'meloxicam', 'indomethacin', 'ketoprofen', 'aceclofenac', 'celecoxib', 'etoricoxib', 'mefenamic', 'nimesulide', 'ketorolac'], 'NSAIDs', 'Pain, fever & inflammation'],
  [['tramadol', 'morphine', 'pethidine', 'codeine', 'fentanyl', 'dihydrocodeine'], 'Opioid analgesics', 'Pain, fever & inflammation'],
  [['paracetamol', 'acetaminophen', 'panadol'], 'Analgesics & antipyretics', 'Pain, fever & inflammation'],
  [['aspirin', 'acetylsalicylic', 'asa/'], 'Salicylates', 'Pain, fever & inflammation'],
  [['prednisolone', 'dexamethasone', 'hydrocortisone', 'betamethasone', 'methylprednisolone', 'prednisone', 'triamcinolone'], 'Corticosteroids', 'Diabetes & hormones'],
  // cardiovascular
  [['amlodipine', 'nifedipine', 'felodipine', 'diltiazem', 'verapamil'], 'Calcium channel blockers', 'Cardiovascular'],
  [['enalapril', 'lisinopril', 'captopril', 'ramipril', 'perindopril'], 'ACE inhibitors', 'Cardiovascular'],
  [['losartan', 'valsartan', 'telmisartan', 'irbesartan', 'candesartan', 'olmesartan'], 'Angiotensin receptor blockers', 'Cardiovascular'],
  [['atenolol', 'propranolol', 'metoprolol', 'bisoprolol', 'carvedilol', 'labetalol'], 'Beta blockers', 'Cardiovascular'],
  [['hydrochlorothiazide', 'bendroflumethiazide', 'chlorthalidone', 'indapamide', 'furosemide', 'frusemide', 'spironolactone', 'torsemide', 'amiloride'], 'Diuretics', 'Cardiovascular'],
  [['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin'], 'Statins', 'Cardiovascular'],
  [['methyldopa', 'hydralazine', 'clonidine'], 'Other antihypertensives', 'Cardiovascular'],
  [['warfarin', 'heparin', 'enoxaparin', 'rivaroxaban', 'apixaban', 'clopidogrel'], 'Anticoagulants & antiplatelets', 'Cardiovascular'],
  [['digoxin', 'isosorbide', 'glyceryl trinitrate', 'nitroglycerin', 'amiodarone'], 'Cardiac medicines', 'Cardiovascular'],
  // diabetes and hormones
  [['metformin', 'glibenclamide', 'gliclazide', 'glimepiride', 'glipizide', 'pioglitazone', 'sitagliptin', 'vildagliptin', 'empagliflozin', 'dapagliflozin'], 'Oral antidiabetics', 'Diabetes & hormones'],
  [['insulin', 'mixtard', 'actrapid', 'glargine'], 'Insulins', 'Diabetes & hormones'],
  [['levothyroxine', 'thyroxine', 'carbimazole', 'propylthiouracil'], 'Thyroid medicines', 'Diabetes & hormones'],
  // women's health, urology
  [['levonorgestrel', 'ethinylestradiol', 'medroxyprogesterone', 'norethisterone', 'desogestrel', 'microgynon', 'depo-provera', 'implanon', 'jadelle'], 'Hormonal contraceptives', "Women's health & family planning"],
  [['misoprostol', 'oxytocin', 'ergometrine'], 'Uterotonics', "Women's health & family planning"],
  [['tamsulosin', 'finasteride', 'sildenafil', 'tadalafil', 'oxybutynin'], 'Urological medicines', 'Urology & men\'s health'],
  // respiratory and allergy
  [['salbutamol', 'albuterol', 'terbutaline', 'salmeterol', 'formoterol', 'ipratropium', 'tiotropium'], 'Bronchodilators', 'Respiratory & allergy'],
  [['beclomethasone', 'budesonide', 'fluticasone'], 'Inhaled corticosteroids', 'Respiratory & allergy'],
  [['aminophylline', 'theophylline', 'montelukast'], 'Other asthma medicines', 'Respiratory & allergy'],
  [['cetirizine', 'loratadine', 'desloratadine', 'fexofenadine', 'chlorpheniramine', 'chlorphenamine', 'promethazine', 'diphenhydramine', 'cyproheptadine', 'levocetirizine'], 'Antihistamines', 'Respiratory & allergy'],
  [['dextromethorphan', 'pholcodine', 'bromhexine', 'ambroxol', 'carbocisteine', 'guaifenesin', 'guaiphenesin', 'cough'], 'Cough preparations', 'Respiratory & allergy'],
  [['pseudoephedrine', 'phenylephrine', 'xylometazoline', 'oxymetazoline'], 'Decongestants', 'Respiratory & allergy'],
  // gastrointestinal
  [['omeprazole', 'esomeprazole', 'lansoprazole', 'pantoprazole', 'rabeprazole'], 'Proton pump inhibitors', 'Gastrointestinal'],
  [['ranitidine', 'cimetidine', 'famotidine'], 'H2 blockers', 'Gastrointestinal'],
  [['magnesium trisilicate', 'aluminium hydroxide', 'aluminum hydroxide', 'antacid', 'simethicone', 'gaviscon', 'alginate'], 'Antacids', 'Gastrointestinal'],
  [['metoclopramide', 'domperidone', 'ondansetron', 'prochlorperazine'], 'Antiemetics', 'Gastrointestinal'],
  [['hyoscine', 'buscopan', 'dicyclomine', 'mebeverine', 'drotaverine'], 'Antispasmodics', 'Gastrointestinal'],
  [['loperamide'], 'Antidiarrhoeals', 'Gastrointestinal'],
  [['bisacodyl', 'lactulose', 'senna', 'liquid paraffin', 'glycerin suppos', 'sodium picosulfate'], 'Laxatives', 'Gastrointestinal'],
  // nervous system and mental health
  [['diazepam', 'lorazepam', 'alprazolam', 'clonazepam', 'midazolam', 'bromazepam'], 'Benzodiazepines', 'Nervous system & mental health'],
  [['amitriptyline', 'fluoxetine', 'sertraline', 'paroxetine', 'citalopram', 'escitalopram', 'imipramine', 'mirtazapine'], 'Antidepressants', 'Nervous system & mental health'],
  [['haloperidol', 'chlorpromazine', 'olanzapine', 'risperidone', 'quetiapine', 'fluphenazine', 'trifluoperazine'], 'Antipsychotics', 'Nervous system & mental health'],
  [['carbamazepine', 'phenytoin', 'phenobarbital', 'phenobarbitone', 'sodium valproate', 'valproic', 'lamotrigine', 'levetiracetam'], 'Antiepileptics', 'Nervous system & mental health'],
  [['benzhexol', 'trihexyphenidyl', 'levodopa', 'carbidopa'], 'Antiparkinson medicines', 'Nervous system & mental health'],
  [['pregabalin', 'gabapentin', 'flunarizine', 'cinnarizine', 'betahistine', 'piracetam'], 'Other nervous system medicines', 'Nervous system & mental health'],
  [['lidocaine', 'lignocaine', 'bupivacaine'], 'Local anaesthetics', 'Medical supplies'],
  // muscle and joint
  [['orphenadrine', 'methocarbamol', 'chlorzoxazone', 'tizanidine', 'baclofen'], 'Muscle relaxants', 'Muscle & joint'],
  [['allopurinol', 'colchicine', 'febuxostat'], 'Gout medicines', 'Muscle & joint'],
  [['glucosamine', 'chondroitin'], 'Joint supplements', 'Muscle & joint'],
  // vitamins, minerals, fluids
  [['oral rehydration', 'ors', 'zinc sulph', 'zinc sulfate'], 'Oral rehydration & zinc', 'Fluids & electrolytes'],
  [['sodium chloride', 'normal saline', 'dextrose', 'ringer', 'darrow', 'glucose infusion', 'water for injection'], 'Intravenous fluids', 'Fluids & electrolytes'],
  // skin, eye, ear, nose
  [['silver sulfadiazine', 'mupirocin', 'fusidic', 'gentian violet', 'povidone', 'chlorhexidine', 'hydrogen peroxide', 'methylated spirit', 'surgical spirit'], 'Antiseptics & topical antibiotics', 'Skin'],
  [['tretinoin', 'benzoyl peroxide', 'adapalene', 'salicylic', 'calamine', 'zinc oxide', 'petroleum jelly', 'aqueous cream', 'emulsifying'], 'Skin preparations', 'Skin'],
  [['eye drop', 'eye ointment', 'ophthalmic', 'tetrahydrozoline', 'artificial tears', 'timolol'], 'Eye preparations', 'Eye, ear & nose'],
  [['ear drop', 'otic'], 'Ear preparations', 'Eye, ear & nose'],
  [['ferrous', 'iron', 'folic', 'haematinic', 'hematinic'], 'Iron & folic acid', 'Vitamins, minerals & nutrition'],
  [['vitamin', 'ascorbic', 'multivit', 'thiamine', 'pyridoxine', 'cyanocobalamin', 'riboflavin', 'niacin', 'calcium', 'magnesium', 'zinc', 'cod liver', 'omega'], 'Vitamins & minerals', 'Vitamins, minerals & nutrition'],
  // supplies
];

/** A typed category placed in a therapeutic area by the words in it */
const AREA_WORDS = [
  [['antibiotic', 'antibacterial', 'penicillin', 'cephalosporin', 'macrolide', 'quinolone'], 'Anti-infectives'],
  [['antimalarial', 'malaria'], 'Antimalarials'],
  [['tb', 'tuberculosis'], 'Anti-TB'],
  [['antiviral', 'antiretroviral', 'arv', 'hiv'], 'Antivirals & HIV'],
  [['antifungal'], 'Antifungals'],
  [['anthelmintic', 'dewormer', 'antiparasitic'], 'Antiparasitics & deworming'],
  [['analgesic', 'nsaid', 'antipyretic', 'pain', 'anti-inflammatory', 'opioid'], 'Pain, fever & inflammation'],
  [['antihypertensive', 'hypertension', 'cardiac', 'cardio', 'diuretic', 'statin', 'anticoagulant'], 'Cardiovascular'],
  [['antidiabetic', 'diabetes', 'insulin', 'hormone', 'thyroid', 'steroid', 'corticosteroid'], 'Diabetes & hormones'],
  [['antihistamine', 'antitussive', 'cough', 'cold', 'asthma', 'bronchodilator', 'allergy', 'respiratory', 'decongestant'], 'Respiratory & allergy'],
  [['ppi', 'antacid', 'antiemetic', 'laxative', 'antidiarrhoeal', 'antispasmodic', 'gastro', 'ulcer'], 'Gastrointestinal'],
  [['antidepressant', 'antipsychotic', 'antiepileptic', 'anticonvulsant', 'sedative', 'hypnotic', 'anxiolytic', 'psychiatric'], 'Nervous system & mental health'],
  [['supplement', 'vitamin', 'mineral', 'nutrition', 'haematinic', 'iron'], 'Vitamins, minerals & nutrition'],
  [['electrolyte', 'rehydration', 'infusion', 'iv fluid'], 'Fluids & electrolytes'],
  [['dermatological', 'skin', 'topical', 'antiseptic', 'cream'], 'Skin'],
  [['eye', 'ear', 'nasal', 'ophthalmic'], 'Eye, ear & nose'],
  [['contraceptive', 'family planning', 'gynae', 'obstetric', 'women'], "Women's health & family planning"],
  [['urolog', 'prostate', 'erectile'], 'Urology & men\'s health'],
  [['muscle', 'joint', 'gout', 'relaxant'], 'Muscle & joint'],
  [['supplies', 'sundries', 'consumable', 'device', 'dressing'], 'Medical supplies'],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The class found in a text (lower case), or null */
export function classify(text) {
  const has = (stem) => (stem.length <= 4 ? new RegExp('(^|[^a-z])' + esc(stem)).test(text) : text.includes(stem));
  for (const [stems, cls, area] of RULES) if (stems.some(has)) return { cls, area };
  return null;
}
/** The area a typed category belongs to, or null when its words don't say */
export function areaOfCategory(category) {
  const c = String(category).toLowerCase();
  for (const [words, area] of AREA_WORDS) if (words.some((w) => new RegExp('(^|[^a-z])' + esc(w)).test(c))) return area;
  for (const [, cls, area] of RULES) if (cls.toLowerCase() === c) return area;
  return null;
}
const cache = new Map();
/** The class and area of a medicine: its own category when filled in, else worked out from its generic name and name */
export function drugClassOf(p) {
  const cat = String(p.category || '').trim();
  const key = `${cat}|${p.generic || ''}|${p.name || ''}`;
  if (cache.has(key)) return cache.get(key);
  const text = ` ${p.generic || ''} ${p.name || ''} `.toLowerCase().replace(/[^a-z0-9/\- ]+/g, ' ');
  const found = classify(text);
  const r = cat ? { cls: cat, area: areaOfCategory(cat) || found?.area || OTHER_AREA } : found || { cls: UNCLASSIFIED, area: OTHER_AREA };
  cache.set(key, r);
  return r;
}

/** How a list of medicines is sorted and grouped (Inventory, Stock Count, Shelves) */
export const MEDICINE_ORDERS = [['name', 'Name'], ['drugClass', 'Pharmacological class'], ['area', 'Therapeutic area'], ['form', 'Dosage form'], ['shelf', 'Shelf']];
export const shelfOf = (p) => String(p.shelf || '').trim();
/** The group a medicine falls in ('' for name: no groups) */
export const groupOf = (p, order) => (order === 'drugClass' ? drugClassOf(p).cls : order === 'area' ? drugClassOf(p).area
  : order === 'form' ? String(p.form || '').trim() || 'No form' : order === 'shelf' ? shelfOf(p) || 'No shelf' : '');
const rank = (g, order) => (order === 'area' ? (THERAPEUTIC_AREAS.includes(g) ? THERAPEUTIC_AREAS.indexOf(g) : THERAPEUTIC_AREAS.length) : g === UNCLASSIFIED || g === 'No form' || g === 'No shelf' ? 1 : 0);
/** Medicines in groups for an order: [[group, medicines by name]] */
export function groupMedicines(list, order) {
  const groups = new Map();
  for (const p of list) { const g = groupOf(p, order); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p); }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // as Dart's compareTo, so both apps order the same
  const byName = (a, b) => cmp(String(a.name).toLowerCase(), String(b.name).toLowerCase());
  return [...groups.keys()].sort((a, b) => rank(a, order) - rank(b, order) || cmp(a.toLowerCase(), b.toLowerCase())).map((g) => [g, groups.get(g).sort(byName)]);
}
