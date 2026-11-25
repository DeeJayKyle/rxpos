// Drug classes for sorting, grouping and shelving: the pharmacological class (e.g. "Penicillins") and the
// therapeutic area (e.g. "Anti-infectives") of a medicine. The medicine's own "Category / class" (the React app's
// `category` field) wins when it is filled in; otherwise the class is worked out from the generic name (or the name),
// so the standard catalogue and medicines added without a category are classified too. Nothing is written to the
// records: the class is derived each time, and setting a category changes it on both apps.
import '../entities/product.dart';

/// Therapeutic areas, in the order lists and shelves show them.
const therapeuticAreas = [
  'Anti-infectives', 'Antimalarials', 'Anti-TB', 'Antivirals & HIV', 'Antifungals', 'Antiparasitics & deworming',
  'Pain, fever & inflammation', 'Cardiovascular', 'Diabetes & hormones', 'Respiratory & allergy', 'Gastrointestinal',
  'Nervous system & mental health', 'Vitamins, minerals & nutrition', 'Fluids & electrolytes', 'Skin', 'Eye, ear & nose',
  "Women's health & family planning", 'Urology & men\'s health', 'Muscle & joint', 'Medical supplies', 'Other',
];

const otherArea = 'Other', unclassified = 'Unclassified';

/// (stems found in the generic name or name, pharmacological class, therapeutic area). Checked in order: the more
/// specific stems first.
const _rules = <(List<String>, String, String)>[
  (['plaster', 'bandage', 'gauze', 'cotton wool', 'syringe', 'needle', 'cannula', 'glove', 'catheter', 'condom', 'test kit', 'strip', 'lancet', 'mask', 'giving set', 'suture', 'thermometer'], 'Medical supplies', 'Medical supplies'),
  // anti-infectives
  (['amoxicillin', 'ampicillin', 'cloxacillin', 'flucloxacillin', 'penicillin', 'benzathine', 'piperacillin', 'phenoxymethyl'], 'Penicillins', 'Anti-infectives'),
  (['cef', 'ceph'], 'Cephalosporins', 'Anti-infectives'),
  (['azithromycin', 'erythromycin', 'clarithromycin'], 'Macrolides', 'Anti-infectives'),
  (['ciprofloxacin', 'levofloxacin', 'norfloxacin', 'ofloxacin', 'moxifloxacin'], 'Fluoroquinolones', 'Anti-infectives'),
  (['doxycycline', 'tetracycline', 'oxytetracycline', 'minocycline'], 'Tetracyclines', 'Anti-infectives'),
  (['gentamicin', 'amikacin', 'streptomycin', 'kanamycin', 'neomycin'], 'Aminoglycosides', 'Anti-infectives'),
  (['cotrimoxazole', 'co-trimoxazole', 'sulfamethoxazole', 'trimethoprim', 'septrin'], 'Sulfonamides', 'Anti-infectives'),
  (['metronidazole', 'tinidazole', 'secnidazole', 'ornidazole'], 'Nitroimidazoles', 'Anti-infectives'),
  (['nitrofurantoin'], 'Urinary antiseptics', 'Anti-infectives'),
  (['clindamycin', 'lincomycin'], 'Lincosamides', 'Anti-infectives'),
  (['chloramphenicol'], 'Amphenicols', 'Anti-infectives'),
  (['vancomycin', 'meropenem', 'imipenem', 'linezolid'], 'Reserve antibiotics', 'Anti-infectives'),
  // antimalarials, TB, antivirals, antifungals, antiparasitics
  (['artemether', 'lumefantrine', 'artesunate', 'dihydroartemisinin', 'piperaquine', 'amodiaquine', 'quinine', 'chloroquine', 'primaquine', 'mefloquine', 'sulfadoxine', 'fansidar', 'proguanil', 'atovaquone'], 'Antimalarials', 'Antimalarials'),
  (['rifampicin', 'isoniazid', 'pyrazinamide', 'ethambutol', 'rifapentine'], 'Anti-TB medicines', 'Anti-TB'),
  (['tenofovir', 'lamivudine', 'dolutegravir', 'efavirenz', 'nevirapine', 'zidovudine', 'abacavir', 'lopinavir', 'ritonavir', 'atazanavir', 'emtricitabine'], 'Antiretrovirals', 'Antivirals & HIV'),
  (['acyclovir', 'aciclovir', 'valacyclovir', 'valaciclovir', 'oseltamivir'], 'Antivirals', 'Antivirals & HIV'),
  (['fluconazole', 'ketoconazole', 'itraconazole', 'clotrimazole', 'miconazole', 'griseofulvin', 'nystatin', 'terbinafine', 'econazole', 'tioconazole', 'whitfield'], 'Antifungals', 'Antifungals'),
  (['albendazole', 'mebendazole', 'levamisole', 'praziquantel', 'ivermectin', 'piperazine', 'pyrantel', 'niclosamide'], 'Anthelmintics', 'Antiparasitics & deworming'),
  (['permethrin', 'benzyl benzoate'], 'Scabicides', 'Skin'),
  // pain, fever and inflammation
  (['diclofenac', 'ibuprofen', 'naproxen', 'piroxicam', 'meloxicam', 'indomethacin', 'ketoprofen', 'aceclofenac', 'celecoxib', 'etoricoxib', 'mefenamic', 'nimesulide', 'ketorolac'], 'NSAIDs', 'Pain, fever & inflammation'),
  (['tramadol', 'morphine', 'pethidine', 'codeine', 'fentanyl', 'dihydrocodeine'], 'Opioid analgesics', 'Pain, fever & inflammation'),
  (['paracetamol', 'acetaminophen', 'panadol'], 'Analgesics & antipyretics', 'Pain, fever & inflammation'),
  (['aspirin', 'acetylsalicylic', 'asa/'], 'Salicylates', 'Pain, fever & inflammation'),
  (['prednisolone', 'dexamethasone', 'hydrocortisone', 'betamethasone', 'methylprednisolone', 'prednisone', 'triamcinolone'], 'Corticosteroids', 'Diabetes & hormones'),
  // cardiovascular
  (['amlodipine', 'nifedipine', 'felodipine', 'diltiazem', 'verapamil'], 'Calcium channel blockers', 'Cardiovascular'),
  (['enalapril', 'lisinopril', 'captopril', 'ramipril', 'perindopril'], 'ACE inhibitors', 'Cardiovascular'),
  (['losartan', 'valsartan', 'telmisartan', 'irbesartan', 'candesartan', 'olmesartan'], 'Angiotensin receptor blockers', 'Cardiovascular'),
  (['atenolol', 'propranolol', 'metoprolol', 'bisoprolol', 'carvedilol', 'labetalol'], 'Beta blockers', 'Cardiovascular'),
  (['hydrochlorothiazide', 'bendroflumethiazide', 'chlorthalidone', 'indapamide', 'furosemide', 'frusemide', 'spironolactone', 'torsemide', 'amiloride'], 'Diuretics', 'Cardiovascular'),
  (['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin'], 'Statins', 'Cardiovascular'),
  (['methyldopa', 'hydralazine', 'clonidine'], 'Other antihypertensives', 'Cardiovascular'),
  (['warfarin', 'heparin', 'enoxaparin', 'rivaroxaban', 'apixaban', 'clopidogrel'], 'Anticoagulants & antiplatelets', 'Cardiovascular'),
  (['digoxin', 'isosorbide', 'glyceryl trinitrate', 'nitroglycerin', 'amiodarone'], 'Cardiac medicines', 'Cardiovascular'),
  // diabetes and hormones
  (['metformin', 'glibenclamide', 'gliclazide', 'glimepiride', 'glipizide', 'pioglitazone', 'sitagliptin', 'vildagliptin', 'empagliflozin', 'dapagliflozin'], 'Oral antidiabetics', 'Diabetes & hormones'),
  (['insulin', 'mixtard', 'actrapid', 'glargine'], 'Insulins', 'Diabetes & hormones'),
  (['levothyroxine', 'thyroxine', 'carbimazole', 'propylthiouracil'], 'Thyroid medicines', 'Diabetes & hormones'),
  // women's health, urology
  (['levonorgestrel', 'ethinylestradiol', 'medroxyprogesterone', 'norethisterone', 'desogestrel', 'microgynon', 'depo-provera', 'implanon', 'jadelle'], 'Hormonal contraceptives', "Women's health & family planning"),
  (['misoprostol', 'oxytocin', 'ergometrine'], 'Uterotonics', "Women's health & family planning"),
  (['tamsulosin', 'finasteride', 'sildenafil', 'tadalafil', 'oxybutynin'], 'Urological medicines', 'Urology & men\'s health'),
  // respiratory and allergy
  (['salbutamol', 'albuterol', 'terbutaline', 'salmeterol', 'formoterol', 'ipratropium', 'tiotropium'], 'Bronchodilators', 'Respiratory & allergy'),
  (['beclomethasone', 'budesonide', 'fluticasone'], 'Inhaled corticosteroids', 'Respiratory & allergy'),
  (['aminophylline', 'theophylline', 'montelukast'], 'Other asthma medicines', 'Respiratory & allergy'),
  (['cetirizine', 'loratadine', 'desloratadine', 'fexofenadine', 'chlorpheniramine', 'chlorphenamine', 'promethazine', 'diphenhydramine', 'cyproheptadine', 'levocetirizine'], 'Antihistamines', 'Respiratory & allergy'),
  (['dextromethorphan', 'pholcodine', 'bromhexine', 'ambroxol', 'carbocisteine', 'guaifenesin', 'guaiphenesin', 'cough'], 'Cough preparations', 'Respiratory & allergy'),
  (['pseudoephedrine', 'phenylephrine', 'xylometazoline', 'oxymetazoline'], 'Decongestants', 'Respiratory & allergy'),
  // gastrointestinal
  (['omeprazole', 'esomeprazole', 'lansoprazole', 'pantoprazole', 'rabeprazole'], 'Proton pump inhibitors', 'Gastrointestinal'),
  (['ranitidine', 'cimetidine', 'famotidine'], 'H2 blockers', 'Gastrointestinal'),
  (['magnesium trisilicate', 'aluminium hydroxide', 'aluminum hydroxide', 'antacid', 'simethicone', 'gaviscon', 'alginate'], 'Antacids', 'Gastrointestinal'),
  (['metoclopramide', 'domperidone', 'ondansetron', 'prochlorperazine'], 'Antiemetics', 'Gastrointestinal'),
  (['hyoscine', 'buscopan', 'dicyclomine', 'mebeverine', 'drotaverine'], 'Antispasmodics', 'Gastrointestinal'),
  (['loperamide'], 'Antidiarrhoeals', 'Gastrointestinal'),
  (['bisacodyl', 'lactulose', 'senna', 'liquid paraffin', 'glycerin suppos', 'sodium picosulfate'], 'Laxatives', 'Gastrointestinal'),
  // nervous system and mental health
  (['diazepam', 'lorazepam', 'alprazolam', 'clonazepam', 'midazolam', 'bromazepam'], 'Benzodiazepines', 'Nervous system & mental health'),
  (['amitriptyline', 'fluoxetine', 'sertraline', 'paroxetine', 'citalopram', 'escitalopram', 'imipramine', 'mirtazapine'], 'Antidepressants', 'Nervous system & mental health'),
  (['haloperidol', 'chlorpromazine', 'olanzapine', 'risperidone', 'quetiapine', 'fluphenazine', 'trifluoperazine'], 'Antipsychotics', 'Nervous system & mental health'),
  (['carbamazepine', 'phenytoin', 'phenobarbital', 'phenobarbitone', 'sodium valproate', 'valproic', 'lamotrigine', 'levetiracetam'], 'Antiepileptics', 'Nervous system & mental health'),
  (['benzhexol', 'trihexyphenidyl', 'levodopa', 'carbidopa'], 'Antiparkinson medicines', 'Nervous system & mental health'),
  (['pregabalin', 'gabapentin', 'flunarizine', 'cinnarizine', 'betahistine', 'piracetam'], 'Other nervous system medicines', 'Nervous system & mental health'),
  (['lidocaine', 'lignocaine', 'bupivacaine'], 'Local anaesthetics', 'Medical supplies'),
  // muscle and joint
  (['orphenadrine', 'methocarbamol', 'chlorzoxazone', 'tizanidine', 'baclofen'], 'Muscle relaxants', 'Muscle & joint'),
  (['allopurinol', 'colchicine', 'febuxostat'], 'Gout medicines', 'Muscle & joint'),
  (['glucosamine', 'chondroitin'], 'Joint supplements', 'Muscle & joint'),
  // vitamins, minerals, fluids
  (['oral rehydration', 'ors', 'zinc sulph', 'zinc sulfate'], 'Oral rehydration & zinc', 'Fluids & electrolytes'),
  (['sodium chloride', 'normal saline', 'dextrose', 'ringer', 'darrow', 'glucose infusion', 'water for injection'], 'Intravenous fluids', 'Fluids & electrolytes'),
  // skin, eye, ear, nose
  (['silver sulfadiazine', 'mupirocin', 'fusidic', 'gentian violet', 'povidone', 'chlorhexidine', 'hydrogen peroxide', 'methylated spirit', 'surgical spirit'], 'Antiseptics & topical antibiotics', 'Skin'),
  (['tretinoin', 'benzoyl peroxide', 'adapalene', 'salicylic', 'calamine', 'zinc oxide', 'petroleum jelly', 'aqueous cream', 'emulsifying'], 'Skin preparations', 'Skin'),
  (['eye drop', 'eye ointment', 'ophthalmic', 'tetrahydrozoline', 'artificial tears', 'timolol'], 'Eye preparations', 'Eye, ear & nose'),
  (['ear drop', 'otic'], 'Ear preparations', 'Eye, ear & nose'),
  (['ferrous', 'iron', 'folic', 'haematinic', 'hematinic'], 'Iron & folic acid', 'Vitamins, minerals & nutrition'),
  (['vitamin', 'ascorbic', 'multivit', 'thiamine', 'pyridoxine', 'cyanocobalamin', 'riboflavin', 'niacin', 'calcium', 'magnesium', 'zinc', 'cod liver', 'omega'], 'Vitamins & minerals', 'Vitamins, minerals & nutrition'),
  // supplies
];

/// A typed category (the React app's "Category / class") placed in a therapeutic area by the words in it.
const _areaWords = <(List<String>, String)>[
  (['antibiotic', 'antibacterial', 'penicillin', 'cephalosporin', 'macrolide', 'quinolone'], 'Anti-infectives'),
  (['antimalarial', 'malaria'], 'Antimalarials'),
  (['tb', 'tuberculosis'], 'Anti-TB'),
  (['antiviral', 'antiretroviral', 'arv', 'hiv'], 'Antivirals & HIV'),
  (['antifungal'], 'Antifungals'),
  (['anthelmintic', 'dewormer', 'antiparasitic'], 'Antiparasitics & deworming'),
  (['analgesic', 'nsaid', 'antipyretic', 'pain', 'anti-inflammatory', 'opioid'], 'Pain, fever & inflammation'),
  (['antihypertensive', 'hypertension', 'cardiac', 'cardio', 'diuretic', 'statin', 'anticoagulant'], 'Cardiovascular'),
  (['antidiabetic', 'diabetes', 'insulin', 'hormone', 'thyroid', 'steroid', 'corticosteroid'], 'Diabetes & hormones'),
  (['antihistamine', 'antitussive', 'cough', 'cold', 'asthma', 'bronchodilator', 'allergy', 'respiratory', 'decongestant'], 'Respiratory & allergy'),
  (['ppi', 'antacid', 'antiemetic', 'laxative', 'antidiarrhoeal', 'antispasmodic', 'gastro', 'ulcer'], 'Gastrointestinal'),
  (['antidepressant', 'antipsychotic', 'antiepileptic', 'anticonvulsant', 'sedative', 'hypnotic', 'anxiolytic', 'psychiatric'], 'Nervous system & mental health'),
  (['supplement', 'vitamin', 'mineral', 'nutrition', 'haematinic', 'iron'], 'Vitamins, minerals & nutrition'),
  (['electrolyte', 'rehydration', 'infusion', 'iv fluid'], 'Fluids & electrolytes'),
  (['dermatological', 'skin', 'topical', 'antiseptic', 'cream'], 'Skin'),
  (['eye', 'ear', 'nasal', 'ophthalmic'], 'Eye, ear & nose'),
  (['contraceptive', 'family planning', 'gynae', 'obstetric', 'women'], "Women's health & family planning"),
  (['urolog', 'prostate', 'erectile'], 'Urology & men\'s health'),
  (['muscle', 'joint', 'gout', 'relaxant'], 'Muscle & joint'),
  (['supplies', 'sundries', 'consumable', 'device', 'dressing'], 'Medical supplies'),
];

final _cache = <String, ({String cls, String area})>{};

/// The class and area of a medicine: its own category when filled in, else worked out from its generic name and name.
({String cls, String area}) drugClassOf(Product p) {
  final cat = p.category.trim();
  final key = '$cat|${p.generic}|${p.name}';
  return _cache[key] ??= () {
    final text = ' ${p.generic} ${p.name} '.toLowerCase().replaceAll(RegExp(r'[^a-z0-9/\- ]+'), ' ');
    final found = classify(text);
    if (cat.isNotEmpty) return (cls: cat, area: areaOfCategory(cat) ?? found?.area ?? otherArea);
    return found ?? (cls: unclassified, area: otherArea);
  }();
}

/// The class found in a text (lower case), or null.
({String cls, String area})? classify(String text) {
  bool has(String stem) => stem.length <= 4 ? RegExp('(^|[^a-z])${RegExp.escape(stem)}').hasMatch(text) : text.contains(stem);
  for (final (stems, cls, area) in _rules) {
    if (stems.any(has)) return (cls: cls, area: area);
  }
  return null;
}

/// The area a typed category belongs to, or null when its words don't say.
String? areaOfCategory(String category) {
  final c = category.toLowerCase();
  for (final (words, area) in _areaWords) {
    if (words.any((w) => RegExp('(^|[^a-z])${RegExp.escape(w)}').hasMatch(c))) return area;
  }
  for (final (_, cls, area) in _rules) {
    if (cls.toLowerCase() == c) return area;
  }
  return null;
}

/// How a list of medicines is sorted and grouped (Inventory, Stock Count, Shelves).
enum MedicineOrder { name, drugClass, area, form, shelf }

const medicineOrderLabels = {
  MedicineOrder.name: 'Name',
  MedicineOrder.drugClass: 'Pharmacological class',
  MedicineOrder.area: 'Therapeutic area',
  MedicineOrder.form: 'Dosage form',
  MedicineOrder.shelf: 'Shelf',
};

String shelfLabel(Product p) => '${p.raw['shelf'] ?? ''}'.trim();

/// The group a medicine falls in for [order] ('' for [MedicineOrder.name]: no groups).
String groupOf(Product p, MedicineOrder order) => switch (order) {
      MedicineOrder.name => '',
      MedicineOrder.drugClass => drugClassOf(p).cls,
      MedicineOrder.area => drugClassOf(p).area,
      MedicineOrder.form => p.form.trim().isEmpty ? 'No form' : p.form.trim(),
      MedicineOrder.shelf => shelfLabel(p).isEmpty ? 'No shelf' : shelfLabel(p),
    };

int _groupRank(String g, MedicineOrder order) => switch (order) {
      MedicineOrder.area => therapeuticAreas.contains(g) ? therapeuticAreas.indexOf(g) : therapeuticAreas.length,
      _ => g == unclassified || g == 'No form' || g == 'No shelf' ? 1 : 0,
    };

/// Medicines in groups for [order] (group name → medicines by name); one unnamed group for [MedicineOrder.name].
List<(String, List<Product>)> groupMedicines(Iterable<Product> list, MedicineOrder order) {
  final groups = <String, List<Product>>{};
  for (final p in list) {
    (groups[groupOf(p, order)] ??= []).add(p);
  }
  final keys = groups.keys.toList()
    ..sort((a, b) {
      final r = _groupRank(a, order).compareTo(_groupRank(b, order));
      return r != 0 ? r : a.toLowerCase().compareTo(b.toLowerCase());
    });
  return [for (final k in keys) (k, groups[k]!..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase())))];
}
