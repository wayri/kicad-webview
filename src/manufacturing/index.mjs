/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { parseGerber } from './gerber.mjs';
import { parseExcellon } from './excellon.mjs';

export { parseGerber, parseExcellon };
/** Detect from CAM signatures, not a filename extension alone. */
export function detectManufacturing(source, path = '') {
  if (typeof source !== 'string') return null;
  const head = source.slice(0, 65536).replace(/^\uFEFF/, '');
  if (/%\s*(?:FS[LT][AI]X\d\dY\d\d|MO(?:MM|IN)|ADD\d+)/.test(head)) return 'gerber';
  if (/(?:^|\n)\s*M48\s*(?:\r?\n|$)/.test(head)) return 'excellon';
  return null;
}
export function parseManufacturing(source, options = {}) {
  const format = options.format || detectManufacturing(source, options.path);
  if (format === 'gerber') return parseGerber(source.replace(/^\uFEFF/, ''), options);
  if (format === 'excellon' || format === 'xnc') return parseExcellon(source.replace(/^\uFEFF/, ''), options);
  throw new Error('Source is not a recognized Gerber RS-274X or Excellon/XNC file.');
}
