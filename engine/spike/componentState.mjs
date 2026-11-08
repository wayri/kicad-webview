/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Resolve component references without making duplicate designators ambiguous. */
export function uniqueComponentIndexes(components) {
  const indexes = new Map();
  components.forEach((component, index) => {
    const ref = component?.ref;
    if (typeof ref !== "string" || !ref) return;
    indexes.set(ref, indexes.has(ref) ? null : index);
  });
  return indexes;
}

/** A population request is a complete state: unspecified bodies are visible. */
export function populationMask(components, entries) {
  const visible = components.map(() => true);
  const indexes = uniqueComponentIndexes(components);
  if (!Array.isArray(entries)) return visible;
  const requests = new Map();
  for (const entry of entries) {
    if (typeof entry?.reference !== "string" || !entry.reference || typeof entry.populated !== "boolean") continue;
    requests.set(entry.reference, requests.has(entry.reference) ? null : entry.populated);
  }
  for (const [reference, populated] of requests) {
    const index = indexes.get(reference);
    if (index != null && populated != null) visible[index] = populated;
  }
  return visible;
}
