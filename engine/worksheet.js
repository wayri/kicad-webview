/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* KiCad's default drawing sheet in world millimetres. Custom .kicad_wks is not interpreted. */
((root) => {
  "use strict";
  function build(page, path = "", options = {}) {
    const { width, height } = page || {};
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 20 || height <= 20) return [];
    const primitives = [], title = page.titleBlock || {};
    const emit = (p) => primitives.push({ color: "#a0a0a0", width: 0.1524, frame: true, path, ...p });
    const line = (x1, y1, x2, y2, kind = "title-block") => emit({ type: "line", points: [{x:x1,y:y1},{x:x2,y:y2}], kind });
    const rect = (x1, y1, x2, y2, kind) => emit({ type: "polygon", points: [{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}], kind });
    const text = (x, y, content, size = 1.5, extra = {}) => {
      if (content === undefined || content === null || content === "") return;
      emit({ type: "text", x, y, text: String(content), size, fontWidth: size, fontHeight: size,
        angle: 0, align: "left", baseline: "middle", kind: "title-block", ...extra });
    };
    // Source: KiCad 10 template/pagelayout_default.kicad_wks, independently checked
    // with kicad-cli sch export svg. Coordinates in that file are relative to the
    // 10 mm margins; default title-block coordinates count from the lower right.
    rect(0, 0, width, height, "page");
    rect(10, 10, width - 10, height - 10, "page-frame");
    rect(12, 12, width - 12, height - 12, "page-frame");
    for (let x = 60; x < width - 10; x += 50) {
      line(x, 10, x, 12, "page-zone"); line(x, height - 12, x, height - 10, "page-zone");
    }
    for (let x = 35, i = 1; x < width - 10; x += 50, i++) {
      text(x, 11, i, 1.3, {kind:"page-zone"});
      text(x, height - 11, i, 1.3, {kind:"page-zone"});
    }
    for (let y = 60; y < height - 10; y += 50) {
      line(10, y, 12, y, "page-zone"); line(width - 12, y, width - 10, y, "page-zone");
    }
    for (let y = 35, i = 0; y < height - 10; y += 50, i++) {
      // KiCad's repetition increments the character, including beyond Z.
      text(11, y, String.fromCharCode(65 + i), 1.3, {kind:"page-zone",align:"center"});
      text(width - 11, y, String.fromCharCode(65 + i), 1.3, {kind:"page-zone",align:"center"});
    }
    const right = width - 10, bottom = height - 10, left = right - 110;
    rect(left, bottom - 34, right - 2, bottom - 2, "title-block");
    for (const offset of [5.5, 8.5, 12.5, 18.5]) line(left, bottom - offset, right - 2, bottom - offset);
    line(right - 90, bottom - 8.5, right - 90, bottom - 5.5);
    line(right - 26, bottom - 8.5, right - 26, bottom - 2);
    text(right - 87, bottom - 6.9, `Date: ${title.date || ""}`);
    text(right - 109, bottom - 4.1, options.kicadVersion ? `KiCad E.D.A. ${options.kicadVersion}` : "KiCad E.D.A.");
    text(right - 24, bottom - 6.9, `Rev: ${title.rev || ""}`, 1.5, {bold:true});
    text(right - 109, bottom - 6.9, `Size: ${page.format || "User"}`);
    text(right - 24, bottom - 4.1, `Id: ${options.sheetNumber || 1}/${options.sheetCount || 1}`);
    text(right - 109, bottom - 10.7, `Title: ${title.title || ""}`, 2, {bold:true,italic:true});
    text(right - 109, bottom - 14.3, `File: ${String(path).split(/[\\/]/).pop() || ""}`);
    text(right - 109, bottom - 17, `Sheet: ${options.sheetName || "/"}`);
    text(right - 109, bottom - 20, title.company, 1.5, {bold:true});
    for (let i = 0; i < 4; i++) text(right - 109, bottom - 23 - i * 3, title.comments?.[i]);
    return primitives;
  }
  root.KiCadWorksheet = { build };
  if (typeof module === "object" && module.exports) module.exports = root.KiCadWorksheet;
})(typeof globalThis === "object" ? globalThis : this);
