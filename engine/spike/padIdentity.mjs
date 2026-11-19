/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
const value=node=>node&&typeof node==='object'&&!Array.isArray(node)?node.quoted:node;
/** Zero-based direct footprint/module and pad ordinals precede any filtering.
 * Saved IDs are never rewritten. Display-only fallback identity is independent
 * of duplicate pad numbers, references and parser-generated reference labels. */
export function padSourceIdentity(node,ref,footprintOccurrence,padOccurrence){
 for(const tag of ['uuid','tstamp']){
  const atom=value(node.find(item=>Array.isArray(item)&&value(item[0])===tag)?.[1]);
  if(typeof atom==='string'&&atom||typeof atom==='number'&&Number.isFinite(atom))return String(atom);
 }
 if(!Number.isSafeInteger(footprintOccurrence)||footprintOccurrence<0||!Number.isSafeInteger(padOccurrence)||padOccurrence<0)throw TypeError('Choose bounded source pad occurrences.');
 return `display-pad:${footprintOccurrence}:${padOccurrence}`;
}
