import type {KiCadViewer} from './index.js';
export type WayriCADSourceState = 'matching' | 'stale' | 'unverified';
export interface WayriCADPlot {readonly title:string; readonly type?:string; readonly unit?:string; readonly xLabel?:string; readonly series?:readonly {readonly name:string;readonly points:readonly {readonly x:number;readonly y:number|null}[]}[];readonly frames?:readonly unknown[];readonly [key:string]:unknown;}
export interface WayriCADResults {readonly raw:Readonly<Record<string,unknown>>;readonly path:string;readonly report:{readonly plots:readonly WayriCADPlot[];readonly fields:readonly unknown[];readonly tables:readonly unknown[];readonly warnings:readonly string[];readonly [key:string]:unknown;};readonly sourceBindings:readonly {readonly path:string;readonly sha256:string}[];readonly metadata:{readonly portable:Readonly<Record<string,unknown>>|null;readonly library:Readonly<Record<string,unknown>>|null;readonly libraryIntegrity:'unverified';};}
export interface WayriCADSurface {points:number[][];triangles:number[][];values:(number|null)[];nodal:boolean;zKnown:boolean;unit?:string;title?:string;layer?:string;zBasis?:string;}
export function parseWayriCADResults(input:string|Record<string,unknown>,options?:{path?:string}):WayriCADResults;
export function classifyWayriCADSource(model:WayriCADResults,pcbSha256:string):WayriCADSourceState;
export function createWayriCADSurface(plot:WayriCADPlot):WayriCADSurface|null;
export function getWayriCADFrame(plot:WayriCADPlot,index:number):(number|null)[][]|null;
export function probeWayriCADPlot(plot:WayriCADPlot,x:number,y?:number,seriesName?:string):Record<string,unknown>|null;
export function getWayriCADPointHistory(plot:WayriCADPlot,x:number,y:number):WayriCADPlot|null;
export function getWayriCADSourceLinks(model:WayriCADResults):Readonly<{netName:string|null;objectIds:readonly string[]}>;
export class WayriCADResultsViewer extends EventTarget {
 constructor(target:string|HTMLElement,options?:{theme?:'light'|'dark';boardViewer?:KiCadViewer|null});
 load(input:string|Record<string,unknown>,options?:{path?:string;signal?:AbortSignal}):Promise<boolean>;
 loadURL(input:string|URL,options?:{path?:string;signal?:AbortSignal;credentials?:'omit'|'same-origin'}):Promise<boolean>;
 getResults():WayriCADResults|null;
 getSourceState():WayriCADSourceState;
 getView():'2d'|'3d';
 getResultLayers():string[];
 setLayer(layer:string):boolean;
 setBoardOverlay(enabled:boolean):boolean;
 getBoardOverlayState():Record<string,unknown>;
 getRenderStats():Record<string,unknown>;
 setPlot(index:number):boolean;
 setFrame(index:number):void;
 setView(mode:'2d'|'3d'):Promise<string|false>;
 setTheme(theme:'light'|'dark'):void;
 setOpacity(value:number):number;
 attachBoard(viewer:KiCadViewer|null):void;
 highlightSource():boolean;
 locateSource():boolean;
 clear():void;
 dispose():void;
}
