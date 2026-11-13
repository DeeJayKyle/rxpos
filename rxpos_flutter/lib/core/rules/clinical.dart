// Live clinical safety check of a sale (the pill above the till's cart), ported from src/clinical.js: the customer's
// recorded allergies, the same medicine or class twice, and a short list of well-established, clinically important
// interactions. Pure and offline; a prompt for the pharmacist's own judgement, never a block.
import '../entities/product.dart';
import 'drug_class.dart';

class SafetyFinding {
  const SafetyFinding(this.level, this.kind, this.text, this.ids);
  /// 'major' or 'caution'
  final String level;
  /// 'allergy', 'interaction' or 'duplicate'
  final String kind;
  final String text;
  final List<String> ids;
}

class SafetyResult {
  const SafetyResult(this.level, this.findings);
  /// 'ok', 'caution' or 'major'
  final String level;
  final List<SafetyFinding> findings;
}

const _groups = <String, List<String>>{
  'warfarin': ['warfarin', 'acenocoumarol'],
  'nsaid': ['diclofenac', 'ibuprofen', 'naproxen', 'piroxicam', 'meloxicam', 'indomethacin', 'ketoprofen', 'aceclofenac', 'celecoxib', 'etoricoxib', 'mefenamic', 'nimesulide', 'ketorolac', 'aspirin', 'acetylsalicylic'],
  'inrRaisers': ['metronidazole', 'fluconazole', 'cotrimoxazole', 'co-trimoxazole', 'sulfamethoxazole', 'ciprofloxacin', 'erythromycin', 'clarithromycin', 'miconazole'],
  'methotrexate': ['methotrexate'],
  'trimethoprim': ['cotrimoxazole', 'co-trimoxazole', 'trimethoprim', 'septrin'],
  'pde5': ['sildenafil', 'tadalafil', 'vardenafil'],
  'nitrate': ['glyceryl trinitrate', 'nitroglycerin', 'isosorbide'],
  'rifampicin': ['rifampicin', 'rifampin', 'rifabutin'],
  'hormonalContraceptive': ['levonorgestrel', 'ethinylestradiol', 'ethinyl estradiol', 'norethisterone', 'desogestrel', 'etonogestrel', 'microgynon', 'postinor'],
  'arvRifampicin': ['nevirapine', 'dolutegravir', 'lopinavir', 'atazanavir'],
  'tramadol': ['tramadol'],
  'serotonergic': ['fluoxetine', 'sertraline', 'paroxetine', 'citalopram', 'escitalopram', 'amitriptyline', 'clomipramine'],
  'aceArb': ['enalapril', 'lisinopril', 'captopril', 'ramipril', 'perindopril', 'losartan', 'valsartan', 'telmisartan', 'candesartan'],
  'potassium': ['spironolactone', 'amiloride', 'potassium chloride', 'triamterene'],
  'simvastatin': ['simvastatin', 'lovastatin'],
  'strongCyp3a4': ['clarithromycin', 'erythromycin', 'ketoconazole', 'itraconazole'],
  'chelatable': ['ciprofloxacin', 'levofloxacin', 'norfloxacin', 'ofloxacin', 'doxycycline', 'tetracycline'],
  'polyvalent': ['antacid', 'aluminium hydroxide', 'magnesium hydroxide', 'magnesium trisilicate', 'ferrous', 'iron', 'zinc', 'calcium carbonate'],
  'theophylline': ['theophylline', 'aminophylline'],
  'theophyllineRaisers': ['ciprofloxacin', 'erythromycin', 'clarithromycin'],
  'lithium': ['lithium'],
  'opioid': ['morphine', 'pethidine', 'codeine', 'tramadol', 'fentanyl', 'methadone', 'dihydrocodeine'],
  'benzodiazepine': ['diazepam', 'lorazepam', 'alprazolam', 'clonazepam', 'midazolam', 'bromazepam', 'nitrazepam'],
};

const _interactions = <(String, String, String, String)>[
  ('warfarin', 'nsaid', 'major', 'bleeding risk (anticoagulant with an NSAID or aspirin)'),
  ('warfarin', 'inrRaisers', 'major', 'raises the INR: bleeding risk (anticoagulant with an antibiotic / antifungal)'),
  ('methotrexate', 'trimethoprim', 'major', 'bone-marrow toxicity (methotrexate with trimethoprim / co-trimoxazole)'),
  ('methotrexate', 'nsaid', 'caution', 'raises methotrexate levels (methotrexate with an NSAID)'),
  ('pde5', 'nitrate', 'major', 'severe low blood pressure (sildenafil-type with a nitrate)'),
  ('rifampicin', 'hormonalContraceptive', 'major', 'the contraceptive may fail (rifampicin): advise another method'),
  ('rifampicin', 'arvRifampicin', 'caution', 'rifampicin lowers this ARV: the dose may need changing'),
  ('tramadol', 'serotonergic', 'major', 'serotonin syndrome and seizure risk (tramadol with an antidepressant)'),
  ('aceArb', 'potassium', 'caution', 'high potassium risk (ACE inhibitor / ARB with a potassium-sparing drug)'),
  ('simvastatin', 'strongCyp3a4', 'major', 'muscle damage risk (simvastatin with clarithromycin / azole)'),
  ('chelatable', 'polyvalent', 'caution', 'absorption blocked: take the antibiotic 2 hours before or 6 hours after antacids, iron or zinc'),
  ('theophylline', 'theophyllineRaisers', 'caution', 'theophylline toxicity (with ciprofloxacin / a macrolide)'),
  ('lithium', 'nsaid', 'major', 'lithium toxicity (lithium with an NSAID)'),
  ('opioid', 'benzodiazepine', 'major', 'breathing can slow dangerously (opioid with a benzodiazepine)'),
];

const _allergyClasses = <(List<String>, List<String>, String, String)>[
  (['penicillin', 'amoxil', 'amoxicillin', 'ampicillin', 'augmentin', 'cloxacillin'], ['penicillin', 'amoxicillin', 'ampicillin', 'cloxacillin', 'flucloxacillin', 'piperacillin', 'benzathine', 'phenoxymethyl', 'augmentin', 'co-amoxiclav'], 'major', 'penicillin allergy'),
  (['penicillin', 'amoxil', 'amoxicillin'], ['cef', 'ceph'], 'caution', 'penicillin allergy: possible cross-reaction with cephalosporins'),
  (['sulfa', 'sulpha', 'sulfonamide', 'sulphonamide', 'septrin', 'cotrimoxazole', 'co-trimoxazole', 'fansidar'], ['cotrimoxazole', 'co-trimoxazole', 'sulfamethoxazole', 'sulfadoxine', 'septrin', 'sulfasalazine', 'fansidar'], 'major', 'sulfa allergy'),
  (['nsaid', 'aspirin', 'ibuprofen', 'diclofenac', 'brufen'], [], 'major', 'NSAID / aspirin allergy'), // stems: the NSAID group
  (['quinine'], ['quinine'], 'major', 'quinine allergy'),
  (['chloroquine'], ['chloroquine', 'hydroxychloroquine'], 'major', 'chloroquine allergy'),
];
const _allergyStop = {'allergy', 'allergic', 'allergies', 'none', 'nil', 'known', 'drug', 'drugs', 'with', 'reaction', 'rash', 'to', 'and', 'the', 'tablets', 'tablet', 'syrup'};
const _noDoubling = {'NSAIDs', 'Penicillins', 'Benzodiazepines', 'Opioid analgesics', 'Anticoagulants & antiplatelets'};

bool _hasAny(String text, List<String> stems) => stems.any(text.contains);

/// The findings for the medicines in a cart (product ids; a medicine on two lines counts once) and the chosen customer's
/// recorded allergies ('' for a walk-in).
SafetyResult safetyCheck(Iterable<String> productIds, List<Product> products, {String customerName = '', String allergies = ''}) {
  final items = <({String id, String name, String text, String generic, String cls})>[];
  for (final id in {...productIds}) {
    final p = products.where((x) => x.id == id).firstOrNull;
    if (p == null) continue;
    final text = ' ${p.generic.toLowerCase()} ${p.name.toLowerCase()} '.replaceAll(RegExp(r'[^a-z0-9/\- ]+'), ' ');
    items.add((id: id, name: p.name, text: text, generic: p.generic.toLowerCase().trim(), cls: drugClassOf(p).cls));
  }
  final findings = <SafetyFinding>[];
  void add(String level, String kind, String text, List<String> ids) {
    if (!findings.any((f) => f.text == text)) findings.add(SafetyFinding(level, kind, text, ids));
  }

  final note = allergies.toLowerCase().trim();
  final who = customerName.isEmpty ? 'this customer' : customerName;
  if (note.isNotEmpty && !RegExp(r'^(none|nil|nkda|no known)').hasMatch(note)) {
    for (final it in items) {
      for (final (words, stems, level, label) in _allergyClasses) {
        final s = stems.isEmpty ? _groups['nsaid']! : stems;
        if (_hasAny(note, words) && _hasAny(it.text, s)) add(level, 'allergy', '${it.name}: $label recorded for $who', [it.id]);
      }
      if (findings.any((f) => f.kind == 'allergy' && f.ids.first == it.id)) continue;
      for (final w in note.split(RegExp(r'[^a-z0-9-]+')).where((x) => x.length >= 5 && !_allergyStop.contains(x))) {
        if (it.text.contains(' $w') || it.generic == w) add('major', 'allergy', '${it.name}: "$w" allergy recorded for $who', [it.id]);
      }
    }
  }
  for (var i = 0; i < items.length; i++) {
    for (var j = i + 1; j < items.length; j++) {
      final a = items[i], b = items[j];
      if (a.generic.isNotEmpty && a.generic == b.generic) {
        add('caution', 'duplicate', 'Same medicine twice: ${a.name} and ${b.name} (${a.generic})', [a.id, b.id]);
      } else if (a.cls == b.cls && _noDoubling.contains(a.cls)) {
        add('caution', 'duplicate', 'Two ${a.cls}: ${a.name} and ${b.name}', [a.id, b.id]);
      }
    }
  }
  for (final (ga, gb, level, why) in _interactions) {
    for (final a in items.where((x) => _hasAny(x.text, _groups[ga]!))) {
      for (final b in items.where((x) => _hasAny(x.text, _groups[gb]!))) {
        if (a.id != b.id) add(level, 'interaction', '${a.name} + ${b.name}: $why', [a.id, b.id]);
      }
    }
  }
  findings.sort((x, y) => (x.level == 'major' ? 0 : 1).compareTo(y.level == 'major' ? 0 : 1));
  return SafetyResult(findings.any((f) => f.level == 'major') ? 'major' : findings.isEmpty ? 'ok' : 'caution', findings);
}
