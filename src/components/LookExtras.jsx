// This device → Look (1.22.0, the owner's clean-up): the colour level, gradient and surface style, moved here from the
// theme menu so that menu has only Light / Dark / System and the four themes. Everything here is for this device only.
import { Fragment, useState } from 'react';
import { STYLES, applyStyle, savedStyle, saveStyle } from '../surface.js';
import { LEVELS, applyLevel, savedLevel, saveLevel } from '../vivid.js';
import { GRADIENT_BACKGROUNDS, GRADIENT_PRESETS, savedGradient, saveGradient, applyGradient } from '../gradients.js';

/** Gradients on this device (1.17.0, src/gradients.js): the page background, the accents and a preset for the menu */
export function GradientChoice() {
  const [g, setG] = useState(savedGradient);
  const set = (patch) => { const next = { ...g, ...patch }; setG(next); applyGradient(next); saveGradient(next); };
  return (
    <div className="gradient-choice">
      <div className="seg grad-bg" role="radiogroup" aria-label="Gradient background">
        {GRADIENT_BACKGROUNDS.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={g.background === id} className={g.background === id ? 'on' : ''} onClick={() => set({ background: id })}>{label}</button>)}
      </div>
      <button type="button" role="switch" aria-checked={!!g.accents} className={'style-item grad-accents' + (g.accents ? ' on' : '')} onClick={() => set({ accents: !g.accents })}>
        <span className="swatch grad-swatch accents" /><span className="grow">Gradient accents<small className="muted"> · buttons, the menu and card headings</small></span>
      </button>
      <div className="grad-presets" role="radiogroup" aria-label="Gradient preset for the menu and banner">
        <button type="button" role="radio" aria-checked={!g.preset} className={'grad-preset none' + (!g.preset ? ' on' : '')} title="No preset: the theme's own menu" onClick={() => set({ preset: '' })}><span aria-hidden="true">✕</span><small>Theme</small></button>
        {GRADIENT_PRESETS.map(([id, name, a, b]) => (
          <button key={id} type="button" role="radio" aria-checked={g.preset === id} className={'grad-preset' + (g.preset === id ? ' on' : '')} title={`${name}: the menu and the banner`} onClick={() => set({ preset: id })}>
            <span style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} aria-hidden="true" /><small>{name}</small>
          </button>
        ))}
      </div>
    </div>
  );
}


/** The device's colour level: Calm (standard) or Vivid (src/vivid.js) */
export function ColourLevel() {
  const [level, setLevel] = useState(savedLevel);
  const pick = (id) => { applyLevel(id); saveLevel(id); setLevel(id); };
  return LEVELS.map((l) => (
    <button key={l.id} type="button" className={'style-item' + (l.id === level ? ' on' : '')} onClick={() => pick(l.id)}>
      <span className={'swatch level-swatch level-' + l.id} />
      <span className="grow">{l.name}<small className="muted"> · {l.hint}</small></span>
    </button>
  ));
}

/** The device's surface style (src/surface.js) */
export function SurfaceStyle() {
  const [style, setStyle] = useState(savedStyle);
  const pick = (id) => { applyStyle(id); saveStyle(id); setStyle(id); };
  return STYLES.map((s, i) => (<Fragment key={s.id}>
    {s.group && s.group !== STYLES[i - 1]?.group && <div className="bell-sub">{s.group}</div>}
    <button type="button" className={'style-item' + (s.id === style ? ' on' : '')} onClick={() => pick(s.id)}>
      <span className={'swatch style-swatch surface-' + s.id} />
      <span className="grow">{s.name}<small className="muted"> · {s.hint}</small></span>
    </button>
  </Fragment>));
}
