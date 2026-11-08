/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Camera directions in the viewer's board-centred, Z-thickness coordinates. */
export const boardViewPresets = [
  { id: 'top', label: 'Top', direction: [0,0,1], up: [0,1,0] },
  { id: 'bottom', label: 'Bottom', direction: [0,0,-1], up: [0,-1,0] },
  { id: 'front', label: 'Front', direction: [0,-1,0], up: [0,0,1] },
  { id: 'back', label: 'Back', direction: [0,1,0], up: [0,0,1] },
  { id: 'left', label: 'Left', direction: [-1,0,0], up: [0,0,1] },
  { id: 'right', label: 'Right', direction: [1,0,0], up: [0,0,1] },
  { id: 'isometric', label: 'Isometric', direction: [.45,-.38,1], up: [0,0,1] }
];

// Preserve the public fit(true)/fit(false) API used by embedded hosts.
export function boardViewPreset(view) {
  const id=view===true?'top':view===false?'iso':view;
  return boardViewPresets.find(preset=>preset.id===id)||boardViewPresets.at(-1);
}
