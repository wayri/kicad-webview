/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
export const isKiCadPath = path => /\.kicad_(sch|pcb)$/i.test(path);
export const isManufacturingPath = path => /\.(gbr|ger|gerber|pho|art|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gko|gm\d+|g\d+|drl|drd|xln|exc|excellon|xnc|ncd|tap|txt)$/i.test(path);
export const isArchivePath = path => /\.zip$/i.test(path);
export const isDrawingPath = path => isKiCadPath(path)||isManufacturingPath(path)||isArchivePath(path);
export const safeRelativePath = path => typeof path==='string'&&path.length>0&&path.length<=1000&&!/[\\\x00-\x1f\x7f%?#:]/.test(path)&&path.split('/').every(part=>part&&part!=='.'&&part!=='..');
