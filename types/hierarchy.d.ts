/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
export type HierarchyStatus = 'ok'|'missing'|'invalid'|'cycle'|'truncated'|'error';
export interface HierarchyNode {
 id: string; path: string|null; file: string; name: string; uuid: string|null;
 status: HierarchyStatus; role?: 'root'|'unlinked'; children: HierarchyNode[];
}
export interface ProjectHierarchy {
 schema: 'kicad-webview.hierarchy/v1'; rootPath: string|null;
 rootReason: 'explicit'|'entry'|'matching-entry'|'unique-root'|'forest';
 roots: HierarchyNode[]; files: {path: string; sheetCount: number; error?: string}[];
 warnings: string[]; stats: {files: number; instances: number; truncated: boolean};
}
export interface HierarchyFileInput {path: string; source?: string; error?: string;}
export interface HierarchyBuildOptions {root?: string; entry?: string;}
export interface HierarchyLoadOptions extends HierarchyBuildOptions {
 file?: string; ref?: string; baseURL?: string; credentials?: 'omit'|'same-origin'; signal?: AbortSignal;
}
export type HierarchyLoadInput = string|URL|{files: {path:string;url:string}[]; entry?:string}|ArrayLike<{path?:string;source?:string;bytes?:Uint8Array|ArrayBuffer;name?:string;size?:number;arrayBuffer?:()=>Promise<ArrayBuffer>}>|Uint8Array|ArrayBuffer;
export interface HierarchySelection {id: string; path: string; file: string; name: string; uuid: string|null; status: 'ok';}
export declare function buildProjectHierarchy(files: HierarchyFileInput[], options?: HierarchyBuildOptions): ProjectHierarchy;
export declare function loadProjectHierarchy(input: HierarchyLoadInput, options?: HierarchyLoadOptions): Promise<ProjectHierarchy>;
export declare function hierarchyToSVG(model: ProjectHierarchy, options?: {theme?:'light'|'dark'}): string;
export declare class ProjectTree extends EventTarget {
 constructor(target: string|HTMLElement, options?: {theme?:'light'|'dark'; onSelect?: (node: HierarchySelection)=>unknown|Promise<unknown>});
 readonly host: HTMLElement; readonly root: HTMLElement; readonly disposed: boolean;
 load(input: HierarchyLoadInput, options?: HierarchyLoadOptions): Promise<boolean>;
 loadFiles(files: Exclude<HierarchyLoadInput,string|URL|Uint8Array|ArrayBuffer|{files:unknown[];entry?:string}>, options?: HierarchyLoadOptions): Promise<boolean>;
 loadArchive(bytes: Uint8Array|ArrayBuffer, options?: HierarchyLoadOptions): Promise<boolean>;
 setHierarchy(model: ProjectHierarchy): this; setFiles(files: HierarchyFileInput[], options?: HierarchyBuildOptions): this;
 getHierarchy(): ProjectHierarchy|null; select(id:string): boolean; expandAll():void; collapseAll():void;
 setTheme(theme:'light'|'dark'):void; toSVG(options?:{theme?:'light'|'dark'}):string; dispose():void;
 addEventListener(type:'ready', listener:(event:CustomEvent<{hierarchy:ProjectHierarchy}>)=>void, options?:boolean|AddEventListenerOptions):void;
 addEventListener(type:'select', listener:(event:CustomEvent<{node:HierarchySelection}>)=>void, options?:boolean|AddEventListenerOptions):void;
 addEventListener(type:'error', listener:(event:CustomEvent<{error:Error}>)=>void, options?:boolean|AddEventListenerOptions):void;
 addEventListener(type:string, listener:EventListenerOrEventListenerObject|null, options?:boolean|AddEventListenerOptions):void;
}
