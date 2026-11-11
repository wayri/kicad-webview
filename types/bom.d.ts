/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import type {KiCadViewer} from './index.js';
export interface BOMPart {readonly id:string; readonly uuid:string|null; readonly savedUUID?:string; readonly kind:'footprint'|'symbol'; readonly path:string; readonly reference:string|null; readonly properties:Readonly<Record<string,string>>; readonly populated:boolean; readonly excludeFromBom:boolean;}
export interface BOMGroup {readonly value:string; readonly footprint:string; readonly populated:boolean; readonly parts:readonly BOMPart[];}
export interface BOMReport {readonly path:string; readonly sourceKind:'pcb'|'schematic'; readonly parts:readonly BOMPart[]; readonly groups:readonly BOMGroup[]; readonly total:number; readonly fitted:number; readonly dnp:number; readonly excluded:number; readonly eligible:number; readonly warnings:readonly string[]; readonly limits:string;}
export interface BoardStatistics {readonly path:string; readonly sourceKind:'pcb'; readonly footprints:number;readonly pads:number;readonly drilledPads:number;readonly smdPads:number;readonly throughHolePads:number;readonly segments:number;readonly arcs:number;readonly vias:number;readonly straightTrackLengthMm:number;readonly arcTrackLengthMm:number;readonly totalTrackLengthMm:number;readonly omittedTracks:number;readonly boardThicknessMm:number|null;readonly netTracks:readonly {code:string;name:string;lengthMm:number;segments:number;arcs:number}[];readonly layerTracks:readonly {layer:string;lengthMm:number}[];readonly layerFill:readonly {layer:string;areaMm2:number}[];readonly zones:readonly {index:number;uuid:string|null;name:string;layers:readonly string[];outlineAreaMm2:number;fillAreaMm2:number;valid:boolean}[];readonly edgeBounds:Readonly<Record<string,number>>|null;readonly placementCandidates:readonly Readonly<Record<string,unknown>>[];readonly warnings:readonly string[];readonly limits:string;}
export function buildBOM(source:string,options?:{path?:string}):BOMReport;
export function analyzeBoard(source:string,options?:{path?:string}):BoardStatistics;
/** Accepts only a report returned by buildBOM in the same module instance. */
export function bomToCSV(report:BOMReport):string;
export class BOMViewer extends EventTarget {
 constructor(target:string|HTMLElement,options?:{viewer?:KiCadViewer|null;theme?:'light'|'dark'});
 attachViewer(viewer:KiCadViewer|null):void;
 loadSource(source:string,options?:{path?:string}):boolean;
 getBOM():BOMReport|null;
 getBoardStatistics():BoardStatistics|null;
 setMode(mode:'parts'|'board'):boolean;
 setQuery(query:string):void;
 setGrouped(grouped:boolean):void;
 setTheme(theme:'light'|'dark'):void;
 selectPart(part:BOMPart):boolean;
 exportCSV():string;
 downloadCSV():void;
 clear():void;
 dispose():void;
}
