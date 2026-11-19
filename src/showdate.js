// Dates shown the way the pharmacy writes them (This device → Date format: DD/MM/YYYY by default), never in the
// computer's own locale order: a Windows PC set to US English used to show 2 November as 11/2/2026 (1.14.0).
import { deviceSettings } from './device.js';
import { formatDate } from './dateformat.js';
import { localDate, dayOf } from './dates.js';

const fmt = () => deviceSettings().dateFormat || 'dmy';
/** The locale for dates written with a month name (19 Nov 2026 or Nov 19, 2026), in the chosen order */
export const dateLocale = () => (fmt() === 'mdy' ? 'en-US' : 'en-GB');
/** A date (YYYY-MM-DD, an ISO time or a Date) in the chosen format; '' when there is none */
export const showDate = (v) => {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return formatDate(dayOf(v), fmt());
  const d = v instanceof Date ? v : new Date(v); // a Date or milliseconds
  return Number.isNaN(d.getTime()) ? '' : formatDate(localDate(d), fmt());
};
/** A date and its time (24-hour HH:MM) */
export const showDateTime = (v) => {
  if (v == null || v === '') return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${showDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
