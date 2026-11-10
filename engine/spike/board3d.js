/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {boardOrbitControls,setBoardPanMode} from "./orbitCamera.mjs";
const BoardOrbitControls=boardOrbitControls(OrbitControls);
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLLoader } from "three/addons/loaders/VRMLLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import "../design-diff.js";
import "../repo-models.js";
import fzstd from "../vendor/fzstd/fzstd.js";
import "../embedded-models.js";
import "../step-decoder.js";
import { parseKicadBoard } from "@spike/boardParser";
import "../layer-colors.js";
const layerThreeColor = name => Number.parseInt(globalThis.KiCadLayerColors.hexFor(name).slice(1), 16);
import {createDemoSurfaces} from "./demoSurfaces.mjs";
import {cameraState3D} from "./cameraState.mjs";
import {partFocusCamera} from "./partFocus.mjs";
import {trackStrokePlan,throughVia,copperSurfaceMaterial} from "./copperSurface.mjs";
import { viewportSceneIdentity } from "@spike/viewportScenePolicy";
import { populationMask, uniqueComponentIndexes } from "./componentState.mjs";
import { footprintProxies } from "./footprintProxies.mjs";
import {createAnchorProjector} from "./projectAnchor.mjs";
import {createSelectionAppearance,selectionStyle} from "./selectionAppearance.mjs";
import {appearanceName,createTranslucentAppearance,inspectionTarget} from "./translucentAppearance.mjs";
import {copperLayerPlan} from "./copperLayers.mjs";
import {createUpdateBatch} from "./updateBatch.mjs";
import { hasSavedSelection, selectionMatcher, selectableRecord, tapGesture, holdGesture } from "./selectionState.mjs";
import { sphereFitDistance,boxFitDistance } from "./fitPolicy.mjs";
import {createPresentationStudio} from "./presentationStudio.mjs";
import { qualityName, qualityViewport, graphicsProfile, boardOcclusion, boardClipRange, boxNearDepth, configureOcclusionDepth, studioLights, studioMaterials, padHasMaskOpening, physicalColors } from "./renderQuality.mjs";
import { createResultOverlay } from "./result3d.js";
import { sourceZoneGeometry,drillLoopInsideBoard } from "./sourceGeometry.mjs";
import { nativePadOutline,padSourceDetails,nativeDrillOutline } from "./padGeometry.mjs";
import { MeasurementSession,distanceLabel,snapProjectedEdges } from "./measurement3d.mjs";
import { boardViewPresets,boardViewPreset } from "./viewPresets.mjs";
import {createSceneResources} from "./sceneResources.mjs";
import {createSilkscreenDetail} from "./silkscreenDetail.mjs";
import {silkscreenSource,silkscreenPlan,paintSilkscreen} from "./surfaceSilkscreen.mjs";
export { mountResultScene } from "./result3d.js";

const STYLE = `
  :host{display:block;width:100%;height:100%;container-type:inline-size;font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;
    --ink:#e6e9ef;--surface:#151820;--bar:#1e2128;--border:#343944;--accent:#91b9ff;
    --muted:#9ca5b5;--button:#292d36;--button-border:#343944;--button-ink:#e6e9ef;
    --hint:#1e2128e8;--panel:#1e2128f2;--menu:#252a34;--notice:#1e2128;color:var(--ink);color-scheme:dark;--tools-bottom:58px}
  :host([data-theme="light"]){--ink:#252c38;--surface:#e7ebf1;--bar:#fff;--border:#d9dee7;
    --accent:#336ac2;--muted:#616d80;--button:#edf0f5;--button-border:#d9dee7;--button-ink:#252c38;
    --hint:#ffffffed;--panel:#fffffff2;--menu:#fff;--notice:#fff;color-scheme:light}
  *{box-sizing:border-box}.shell{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:var(--surface)}
  .bar{display:flex;align-items:center;gap:6px;min-height:40px;padding:5px 10px;background:var(--bar);border-bottom:1px solid var(--border);flex-wrap:nowrap;flex-shrink:0;min-width:0}
  .title{font-size:10px;font-weight:650;letter-spacing:.07em;color:var(--muted);white-space:nowrap}.detail{font-size:11px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}.spacer{flex:1;min-width:0}
  button,select{background:var(--button);border:1px solid var(--button-border);color:var(--button-ink);padding:4px 8px;border-radius:5px;font:500 11px/1.4 system-ui;min-height:28px;cursor:pointer;flex-shrink:0}
  select{color-scheme:dark}select option{background:var(--menu);color:var(--ink)}select option:disabled{color:var(--muted)}:host([data-theme="light"]) select{color-scheme:light}
  button:hover,select:hover{border-color:var(--accent)}button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .bar button{display:inline-flex;align-items:center;justify-content:center;gap:5px;background:transparent;border-color:transparent}.bar button:hover,.bar button[aria-expanded=true]{background:var(--button);border-color:var(--button-border)}.bar svg{width:15px;height:15px;flex-shrink:0}.view-select{max-width:105px;background:transparent}.bar .divider{width:1px;height:18px;background:var(--border);flex-shrink:0}
  label{display:flex;align-items:center;gap:7px;white-space:nowrap;color:var(--muted);font-size:11px}input{accent-color:var(--accent)}.visibility-options{position:absolute;right:10px;top:10px;z-index:6;width:min(260px,calc(100% - 20px));max-height:calc(100% - 20px);overflow:auto;padding:12px;background:var(--menu);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px #0004;display:grid;gap:12px}.visibility-options[hidden]{display:none}.visibility-options fieldset{min-width:0;margin:0;padding:0;border:0;display:grid;gap:9px}.visibility-options fieldset+fieldset{border-top:1px solid var(--border);padding-top:12px}.visibility-options legend{padding:0 0 8px;color:var(--muted);font-size:10px;font-weight:650;letter-spacing:.06em;text-transform:uppercase}.visibility-options label{white-space:normal;min-width:0}.visibility-options select{min-width:0;width:130px;max-width:65%;margin-left:auto;flex-shrink:1}.visibility-options label>span{min-width:0}.visibility-options{overscroll-behavior:contain;scrollbar-gutter:stable}.display-heading{position:sticky;top:-12px;z-index:1;margin:-12px -12px 0;padding:10px 12px;background:var(--menu);border-bottom:1px solid var(--border)}.visibility-options input{width:16px;height:16px;margin:0}.display-heading{display:flex;align-items:center;justify-content:space-between;font-weight:600}.display-heading button{min-height:24px;padding:1px 6px}.quality-help{margin:0;color:var(--muted);font-size:10px;line-height:1.5}
  .stage{position:relative;flex:1;min-height:0;overflow:hidden}.canvas{position:absolute;inset:0}.canvas canvas{display:block;width:100%;height:100%}
  .hint{padding:4px 10px;color:var(--muted);background:var(--bar);font-size:10px;border-top:1px solid var(--border);flex-shrink:0}
  .inspector{position:absolute;right:12px;bottom:12px;width:min(280px,45%);max-height:50%;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:7px;padding:10px;box-shadow:0 8px 28px #0005}
  .inspector[hidden],.menu[hidden]{display:none}.inspector h2{font-size:13px;margin:0 0 6px;color:var(--accent)}.inspector dl{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;margin:0}.inspector dt{color:var(--muted)}.inspector dd{margin:0;overflow-wrap:anywhere}
  .menu{position:absolute;z-index:4;display:grid;gap:3px;padding:5px;border:1px solid var(--border);border-radius:5px;background:var(--menu);box-shadow:0 7px 25px #0005}
  .notice{padding:3px 9px;background:var(--notice);color:var(--muted);font-size:10px;border-top:1px solid var(--border);flex-shrink:0}.notice details{display:inline;margin-left:8px}.notice summary{display:inline;cursor:pointer;color:var(--accent)}.notice details[open]{display:block;margin:6px 0 0}.notice ul{max-height:120px;overflow:auto;margin:6px 0;padding-left:16px;line-height:1.6}.quality-notice{position:absolute;left:12px;right:12px;top:10px;z-index:7;padding:10px 12px;border:1px solid #bf725c;border-radius:7px;background:var(--panel);color:var(--ink);font-size:12px;max-width:560px;max-height:calc(100% - 20px);overflow:auto}.quality-notice[hidden]{display:none}.quality-notice button{margin:6px 0 0 8px}
  button[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}.measurement-panel{position:absolute;bottom:10px;left:10px;z-index:5;width:min(350px,calc(100% - 20px));padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);box-shadow:0 4px 18px #0003;display:grid;gap:6px;max-height:calc(100% - 20px);overflow:auto;overscroll-behavior:contain}.measurement-panel[hidden],.measurement-label[hidden]{display:none}.measurement-heading{display:flex;align-items:center;gap:6px}.measurement-heading strong{font-size:12px;margin-right:auto}.measurement-panel output{font:600 18px/1.3 system-ui;color:var(--ink);font-variant-numeric:tabular-nums}.measurement-panel small{color:var(--muted);font-size:10px}.measurement-panel .measurement-tools{display:flex;align-items:center;gap:6px}.measurement-panel .measurement-tools select{min-width:0;flex:1}.measurement-panel p{margin:0;color:var(--muted);font-size:11px}.measurement-label{position:absolute;z-index:4;pointer-events:none;padding:4px 7px;border:1px solid #c5a35f;border-radius:5px;background:var(--panel);color:var(--ink);font:600 12px/1.4 system-ui;white-space:nowrap;box-shadow:0 2px 8px #0004}:host([data-measuring=true]) .hint{display:none}
  @media(max-width:700px){.detail{display:none}.bar{gap:4px;padding-inline:6px}.hint{display:none}.inspector{width:min(260px,65%)}}@media(max-width:380px){.title{display:none}.bar{gap:2px}.bar button{padding-inline:5px}.view-select{max-width:90px}}
  @media(pointer:coarse){button,select{min-height:40px}.bar{min-height:50px}.visibility-options label{min-height:32px}}
  :host([data-embedded="true"]) .shell{position:relative}
  :host([data-embedded="true"]) .bar{position:absolute;z-index:5;top:12px;left:12px;right:auto;max-width:calc(100% - 24px);flex-wrap:wrap;gap:3px;min-height:36px;padding:4px;border:1px solid var(--border);border-radius:9px;box-shadow:0 4px 16px #0002;background:var(--bar)}
  :host([data-embedded="true"]) .bar .title,:host([data-embedded="true"]) .bar .detail,:host([data-embedded="true"]) .bar .spacer,:host([data-embedded="true"]) .bar .divider,:host([data-embedded="true"]) .bar .fit-action,:host([data-embedded="true"]) .hint,:host([data-embedded="true"]) .notice{display:none}
  :host([data-embedded="true"]) .bar button{min-height:28px;padding:5px 7px}
  :host([data-embedded="true"]) .visibility-options{top:var(--tools-bottom);max-height:calc(100% - var(--tools-bottom) - 10px)}
  :host([data-embedded="true"]) .quality-notice{top:calc(var(--tools-bottom) + 4px);max-height:calc(100% - var(--tools-bottom) - 16px)}

`;

// The scene filter changes visibility only; saved geometry and cameras stay intact.
export function objectVisibilityPolicy(input = {}) {
  const supportedTypes = ['arcs','pads','vias','tracks','fills','polygons','bodies','silkscreen'];
  const hiddenTypes = [...new Set((Array.isArray(input.hiddenTypes)?input.hiddenTypes:[]).filter(type=>typeof type==='string'&&type.length<=40).slice(0,64))];
  const side = ['top','bottom'].includes(input.side)?input.side:'all';
  return {hiddenTypes,side,supportedTypes,unsupportedTypes:hiddenTypes.filter(type=>!supportedTypes.includes(type)),
    visible(type,layer){return !hiddenTypes.includes(type)&&!(side==='top'&&layer?.startsWith('B.'))&&!(side==='bottom'&&layer?.startsWith('F.'));}};
}

function pathFor(points, transform) {
  const path = new THREE.Path();
  points.forEach((point, index) => {
    const [x, y] = transform(point);
    if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
  });
  return path;
}

function boardShape(board, transform) {
  const loops = board.outlineLoops?.filter((loop) => loop.length >= 3) || [];
  const outer = loops[0] || [
    [board.bounds.minX, board.bounds.minY], [board.bounds.maxX, board.bounds.minY],
    [board.bounds.maxX, board.bounds.maxY], [board.bounds.minX, board.bounds.maxY]
  ];
  const shape = new THREE.Shape();
  pathFor(outer, transform).getPoints().forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y); else shape.lineTo(point.x, point.y);
  });
  for (const loop of loops.slice(1)) shape.holes.push(pathFor(loop, transform));
  return shape;
}

function makeInstanced(group, geometry, material, records, place, identity) {
  if (!records.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, records.length);
  const object = new THREE.Object3D();
  records.forEach((item, index) => {
    place(object, item);
    object.updateMatrix();
    mesh.setMatrixAt(index, object.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.records = records;
  mesh.userData.identity = identity;
  group.add(mesh);
  return mesh;
}

export function mountBoard3D(container, source, options = {}) {
  options ||= {};
  const initialAppearance=appearanceName(options.appearance??'realistic');
  const initialDark = options.dark !== false;
  const board = parseKicadBoard(source);
  const sourceAST=globalThis.KiCadDesignDiff.parse(source),savedZones=sourceZoneGeometry(sourceAST);
  const padDetails=padSourceDetails(sourceAST),nativePads=board.pads.map(pad=>({...pad,...padDetails.get(pad.id)}));
  const geometryDiagnostics=[...(board.geometryWarnings||[])];
  const throughVias=board.vias.filter(throughVia);
  if(throughVias.length!==board.vias.length)geometryDiagnostics.push((board.vias.length-throughVias.length)+' blind/buried via spans are not rendered; only saved through vias are supported.');
  if (!board?.bounds || !Number.isFinite(board.width) || !Number.isFinite(board.height)) {
    throw new Error("SPIKE could not parse this PCB layout.");
  }
  const host = document.createElement("div");
  host.dataset.theme = initialDark ? "dark" : "light";
  host.dataset.embedded = options.embedded === true && typeof options.onDiagnostics === "function" ? "true" : "false";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style"); style.textContent = STYLE;
  const shell = document.createElement("div"); shell.className = "shell";
  const bar = document.createElement("div"); bar.className = "bar"; bar.setAttribute("role","toolbar"); bar.setAttribute("aria-label","3D tools");
  const stage = document.createElement("div"); stage.className = "stage";
  const canvasHost = document.createElement("div"); canvasHost.className = "canvas";
  const hint = document.createElement("div"); hint.className = "hint";
  hint.textContent = "Drag to orbit · right-drag to pan · wheel to zoom · click to inspect";
  const inspector = document.createElement("div"); inspector.className = "inspector"; inspector.hidden = true;
  const menu = document.createElement("div"); menu.className = "menu"; menu.hidden = true;
  const notice = document.createElement("div"); notice.className = "notice";
  notice.textContent = "Material preview · mask openings follow saved pad layer flags · footprint stand-ins where linked models are unavailable.";
  const qualityNotice=document.createElement('div');qualityNotice.className='quality-notice';qualityNotice.hidden=true;qualityNotice.setAttribute('role','status');stage.append(qualityNotice);
  stage.append(canvasHost, inspector, menu); shell.append(bar, stage, hint, notice); shadow.append(style, shell); container.append(host);

  const title = document.createElement("strong"); title.className = "title"; title.textContent = "3D VIEW";
  const detail = document.createElement("span"); detail.className = "detail";
  detail.textContent = `${board.width.toFixed(1)} × ${board.height.toFixed(1)} mm · ${board.components.length} parts · ${board.tracks.length} tracks`;
  const spacer = document.createElement("span"); spacer.className = "spacer";
  function action(label, handler, path, tooltip=label) {
    const button = document.createElement("button"); button.type = "button"; button.title=tooltip;button.setAttribute('aria-label',tooltip);
    if(path){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),shape=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');shape.setAttribute('d',path);svg.append(shape);button.append(svg);}
    const caption=document.createElement('span');caption.textContent=label;button.append(caption);
    button.addEventListener("click",()=>{handler();invalidate();}); bar.append(button); return button;
  }
  const visibilityOptions=document.createElement('section');visibilityOptions.className='visibility-options';visibilityOptions.id='display-options';visibilityOptions.hidden=true;visibilityOptions.setAttribute('aria-label','3D display settings');stage.append(visibilityOptions);
  const displayHeading=document.createElement('div');displayHeading.className='display-heading';displayHeading.append(document.createTextNode('Display'));
  const displayClose=document.createElement('button');displayClose.type='button';displayClose.textContent='×';displayClose.title='Close display settings';displayClose.setAttribute('aria-label','Close display settings');displayClose.onclick=()=>setDisplayOpen(false,true);displayHeading.append(displayClose);
  const renderingOptions=document.createElement('fieldset'),renderingLegend=document.createElement('legend');renderingLegend.textContent='Rendering';renderingOptions.append(renderingLegend);
  const layerOptions=document.createElement('fieldset'),layerLegend=document.createElement('legend');layerLegend.textContent='Visible geometry';layerOptions.append(layerLegend);visibilityOptions.append(displayHeading,renderingOptions,layerOptions);
  function syncEmbeddedPanelOffset(){
    if(host.dataset.embedded!=='true')return;
    const viewport=stage.getBoundingClientRect(),tools=bar.getBoundingClientRect();
    const top=Math.min(Math.max(8,Math.ceil(tools.bottom-viewport.top+6)),Math.max(8,viewport.height-180));
    host.style.setProperty('--tools-bottom',top+'px');
  }
  function setDisplayOpen(open,restoreFocus=false){if(open)syncEmbeddedPanelOffset();visibilityOptions.hidden=!open;displayButton.setAttribute('aria-expanded',String(open));if(restoreFocus)displayButton.focus();}
  function toggle(label, initial, handler) {
    const wrapper = document.createElement("label"), input = document.createElement("input");
    input.type = "checkbox"; input.checked = initial; input.addEventListener("change", () => {handler(input.checked);invalidate();});
    wrapper.append(input, document.createTextNode(label)); layerOptions.append(wrapper); return input;
  }
  bar.append(title, detail, spacer);
  const qualityKey='pocket-kivi:3d-quality:v1';let initialQuality='balanced',savedQuality=false;
  try{const saved=localStorage.getItem(qualityKey);if(['low','balanced','high'].includes(saved)){initialQuality=saved;savedQuality=true;}}catch{}
  if(options.quality)initialQuality=qualityName(options.quality);
  const qualityLabel=document.createElement('label');qualityLabel.className='quality-label';const qualityCaption=document.createElement('span');qualityCaption.textContent='Quality';
  const qualitySelect=document.createElement('select');qualitySelect.setAttribute('aria-label','3D rendering quality');qualitySelect.title='Presentation: studio stage, dense occlusion and enhanced shadows. High: ambient occlusion and enhanced antialiasing. Balanced: responsive studio lighting. Low: reduced memory.';
  for(const [value,label]of [['low','Low'],['balanced','Balanced'],['high','High'],['presentation','Presentation']]){const option=document.createElement('option');option.value=value;option.textContent=label;qualitySelect.append(option);}qualitySelect.value=initialQuality;qualityLabel.append(qualityCaption,qualitySelect);

  const centerX = (board.bounds.minX + board.bounds.maxX) / 2;
  const centerY = (board.bounds.minY + board.bounds.maxY) / 2;
  const world = ([x, y]) => [x - centerX, centerY - y];
  const localPadPoint=([x,y])=>[x,-y];
  const padShape=outline=>{const shape=new THREE.Shape();pathFor(outline.outline,localPadPoint).getPoints().forEach((point,index)=>index?shape.lineTo(point.x,point.y):shape.moveTo(point.x,point.y));if(outline.drill)shape.holes.push(pathFor(outline.drill,localPadPoint));return shape;};
  const width = Math.max(1, board.width), height = Math.max(1, board.height), extent = Math.max(width, height);
  const thickness = board.stackup?.filter((layer) => Number.isFinite(layer.thickness))
    .reduce((sum, layer) => sum + layer.thickness, 0) || 1.6;
  const top = thickness / 2, bottom = -top;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(initialDark ? 0x151820 : 0xe7ebf1);
  const resources=createSceneResources();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, Math.max(3000, extent * 30));
  // OrbitControls captures its up basis at construction. Use the board's
  // thickness axis consistently for orbiting and all fitted camera presets.
  camera.up.set(0,0,1);
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, alpha: false, powerPreference: "high-performance" });
  const gl=renderer.getContext(),graphics=graphicsProfile({maxTextureSize:renderer.capabilities.maxTextureSize,maxRenderbufferSize:gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),deviceMemory:globalThis.navigator?.deviceMemory,hardwareConcurrency:globalThis.navigator?.hardwareConcurrency,floatTargets:renderer.extensions.has('EXT_color_buffer_float'),android:/Android/i.test(globalThis.navigator?.userAgent||'')});
  const modelGeometryBudget=(graphics.constrained?32:graphics.premium?96:64)*1024*1024;
  const modelTextureBudget=(graphics.constrained?16:graphics.premium?64:32)*1024*1024;
  if(!savedQuality&&!options.quality)initialQuality=graphics.defaultQuality;
  let active=true,frame=0,contextLost=false,renderCount=0,pipeline=null,quality=initialQuality,shaderFailure=false;
  function invalidate(){if(!active||contextLost||document.hidden||frame)return;frame=requestAnimationFrame(drawFrame);}
  function graphicsNotice(message,retry=false){qualityNotice.replaceChildren(document.createTextNode(message));qualityNotice.hidden=false;
    const close=document.createElement('button');close.type='button';close.textContent='Dismiss';close.onclick=()=>{qualityNotice.hidden=true;};qualityNotice.append(close);
    if(retry){const button=document.createElement('button');button.type='button';button.textContent='Retry graphics';button.onclick=()=>renderer.forceContextRestore();qualityNotice.append(button);}
  }
  function disposePipeline(){if(!pipeline)return;for(const pass of pipeline.passes){pass.dispose?.();if(pass instanceof GTAOPass){pass.gtaoMaterial.dispose();pass.blendMaterial.dispose();pass.depthTexture?.dispose();}}pipeline.composer.dispose();pipeline=null;}
  function createPipeline(){
    disposePipeline();if(!['high','presentation'].includes(quality)||appearance==='translucent')return;
    if(!renderer.extensions.has('EXT_color_buffer_float'))throw Error('Floating-point render targets are unavailable.');
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false});
    const composer=new EffectComposer(renderer,target),passes=[];pipeline={composer,passes};
    const base=new RenderPass(scene,camera),ao=new GTAOPass(scene,camera,1,1,undefined,boardOcclusion(thickness,quality));
    configureOcclusionDepth(ao.normalMaterial);
    ao.blendIntensity=.65;ao.updatePdMaterial({radius:4,rings:2,samples:quality==='presentation'?24:12});
    // Translucent solder zones, glass and result overlays must not become
    // opaque occluders when the normal/depth pass substitutes its material.
    const inheritedVisibility=ao.overrideVisibility.bind(ao);ao.overrideVisibility=()=>{inheritedVisibility();scene.traverse(object=>{const materials=Array.isArray(object.material)?object.material:[object.material];if(materials.some(material=>material&&(material.transparent||material.depthTest===false)))object.visible=false;});};
    const output=new OutputPass(),smaa=new SMAAPass(1,1);
    for(const texture of [smaa.areaTexture,smaa.searchTexture])texture.image?.addEventListener?.('load',invalidate,{once:true});
    passes.push(base,ao,output,smaa);for(const pass of passes)composer.addPass(pass);
  }
  function fallbackQuality(message){disposePipeline();quality='balanced';qualitySelect.value=quality;host.dataset.quality=quality;shaderFailure=false;renderer.setRenderTarget(null);presentation.apply(false);graphicsNotice(message);sizeViewport();}
  function applyQuality(value,persist=true){quality=qualityName(value);qualitySelect.value=quality;host.dataset.quality=quality;qualityNotice.hidden=true;shaderFailure=false;
    if(persist)try{localStorage.setItem(qualityKey,quality==='presentation'?'high':quality);}catch{}
    presentation.apply(quality==='presentation');renderer.shadowMap.enabled=quality!=='low'&&appearance!=='translucent';renderer.shadowMap.needsUpdate=true;
    try{createPipeline();}catch{fallbackQuality('Enhanced quality is unavailable on this graphics device. Balanced rendering is active.');}
    updateClipping();sizeViewport();invalidate();return quality;
  }
  qualitySelect.onchange=()=>applyQuality(qualitySelect.value);
  renderer.debug.onShaderError=()=>{shaderFailure=true;};
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  // Two bounded, cached maps add contact/depth cues without redrawing shadow
  // geometry every orbit frame. Geometry/visibility changes invalidate them.
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  // A small, generated neutral studio supplies reflections to metallic STEP /
  // glTF materials. No network environment map or model-material rewrite.
  function createEnvironment(){if(!renderer.extensions.has('EXT_color_buffer_float'))return null;let room,generator;try{room=new RoomEnvironment();generator=new THREE.PMREMGenerator(renderer);return generator.fromScene(room,.04,.1,100);}catch{graphicsNotice('Studio reflections are unavailable on this graphics device. Direct lighting remains active.');return null;}finally{room?.dispose();generator?.dispose();}}
  let environment=createEnvironment();
  scene.environment = environment?.texture||null; scene.environmentIntensity = .65;
  canvasHost.append(renderer.domElement);
  const controls = new BoardOrbitControls(camera, renderer.domElement);
  let userAdjustedCamera = false;
  const cameraInteraction = () => { userAdjustedCamera = true; };
  controls.addEventListener("start", cameraInteraction);
  controls.addEventListener('change',invalidate);
  controls.enableDamping = false; controls.dampingFactor = 0.1; controls.screenSpacePanning = true;
  controls.minDistance = Math.max(2, extent * .04); controls.maxDistance = extent * 8;
  // Oblique keys reveal chamfers and body shape on either face. Neutral fill
  // keeps dark packages readable without flattening all the surface normals.
  scene.add(new THREE.AmbientLight(0xffffff, .35));
  for (const light of studioLights) {
    const key = new THREE.DirectionalLight(light.color, light.intensity);
    if(Math.abs(light.z)===1){
      key.castShadow=true;key.shadow.mapSize.set(1024,1024);
      key.shadow.camera.left=key.shadow.camera.bottom=-extent;
      key.shadow.camera.right=key.shadow.camera.top=extent;
      key.shadow.camera.near=.1;key.shadow.camera.far=extent*5;
      key.shadow.normalBias=.02;key.shadow.bias=-.0001;
    }
    key.position.set(extent * light.x, extent * light.y, extent * light.z); scene.add(key);
  }
  const presentation=createPresentationStudio(THREE,{scene,renderer,extent,bottom,constrained:graphics.constrained});
  const boardGroup = new THREE.Group(); scene.add(boardGroup);
  const copperGroups = new Map(), pickables = [];
  let objectVisibility=objectVisibilityPolicy();
  const visibilityRecords=[];
  const visibilityRecord=(mesh,type,layer)=>{visibilityRecords.push({mesh,type,layer});mesh.visible=objectVisibility.visible(type,layer);return mesh;};
  const arcIds=new Set(sourceAST.filter(node=>Array.isArray(node)&&node[0]==='arc').map(node=>{const id=node.find(value=>Array.isArray(value)&&['uuid','tstamp'].includes(value[0]))?.[1];return typeof id==='object'?id?.quoted:id;}).filter(Boolean));
  const isArc=track=>arcIds.has(track.id)||arcIds.has(track.id?.replace(/:\d+$/,''))||/^track-\d+:\d+$/.test(track.id||'');
  const copperPlan=copperLayerPlan(board,thickness),renderedCopperLayers=new Set(),layerEnabled=new Map(copperPlan.map(layer=>[layer.name,true]));
  const translucency=createTranslucentAppearance(),appearanceRecords=[];let appearance='realistic',selectionAppearanceReady=false;
  const appearanceLabel=document.createElement('label');appearanceLabel.append(document.createTextNode('Appearance'));
  const appearanceSelect=document.createElement('select');appearanceSelect.setAttribute('aria-label','3D board appearance');
  for(const [value,label]of [['realistic','Realistic'],['layers','Layer colors'],['translucent','Translucent']]){const option=document.createElement('option');option.value=value;option.textContent=label;appearanceSelect.append(option);}appearanceLabel.append(appearanceSelect);
  const qualityHelp=document.createElement('p');qualityHelp.className='quality-help';qualityHelp.textContent='Translucent reveals copper in layer colors through the board and models. Fills stay faint; shadows and screen-space occlusion are disabled in this inspection mode. Presentation adds a stage and enhanced shadows in opaque modes.';renderingOptions.append(appearanceLabel,qualityLabel,qualityHelp);
  function applyAppearance(value=appearance){
    const next=appearanceName(value),previous=appearance;if(selectionAppearanceReady)selectionAppearance.restore();translucency.setEnabled(false);appearance=next;appearanceSelect.value=next;host.dataset.appearance=next;
    if(next==='translucent')ensureInternalCopper();const realistic=next==='realistic';
    for(const {mesh,role,layer,pads}of appearanceRecords){
      if(role==='pads'){mesh.material.color.setHex(0xffffff);const color=new THREE.Color();pads.forEach((pad,index)=>mesh.setColorAt(index,color.setHex(realistic?(padHasMaskOpening(pad,layer)?physicalColors.exposedCopper:physicalColors.coatedCopper):layerThreeColor(layer))));if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
      else mesh.material.color.setHex(realistic?physicalColors.coatedCopper:layerThreeColor(layer));
      mesh.material.metalness=realistic&&role!=='pads'?.08:studioMaterials.copper.metalness;mesh.material.roughness=realistic&&role!=='pads'?.52:studioMaterials.copper.roughness;
    }
    for(const layer of copperPlan){const group=copperGroups.get(layer.name);if(group)group.visible=layerEnabled.get(layer.name)&&(!layer.internal||next==='translucent');}
    translucency.setEnabled(next==='translucent');renderer.shadowMap.enabled=quality!=='low'&&next!=='translucent';renderer.shadowMap.needsUpdate=true;
    if((previous==='translucent')!==(next==='translucent'))try{createPipeline();}catch{fallbackQuality('Enhanced quality is unavailable. Balanced rendering is active.');}
    if(selectionAppearanceReady)setSelection(externalSelection);options.onAppearanceChange?.(next);invalidate();return next;
  }
  appearanceSelect.onchange=()=>applyAppearance(appearanceSelect.value);
  const groupFor = (layer) => {
    if (!copperGroups.has(layer)) { const group = new THREE.Group(); group.name = layer; boardGroup.add(group); copperGroups.set(layer, group); }
    return copperGroups.get(layer);
  };
  const shape = boardShape(board, world);
  // Saved pad/via drill loops cut the substrate itself; NPTH does not need a
  // copper annulus. Cap triangulation work and disclose omissions explicitly.
  const drilled=new Set();let drillCount=0,drillPoints=0,omittedDrills=0;
  const inside=(point,loop)=>{let result=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){const [a,b]=[loop[i],loop[j]];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;};
  const outer=board.outlineLoops?.[0],outlineHoles=board.outlineLoops?.slice(1)||[];
  for(const item of [...nativePads,...throughVias.map(via=>({...via,shape:'circle',width:via.size,height:via.size,drillShape:'circle',rotation:0}))]){
    if(!(item.drill>0))continue;const loop=nativeDrillOutline(item);if(!loop){omittedDrills++;continue;}
    const angle=(item.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),[cx,cy]=world(item.at);
    if(outlineHoles.some(hole=>inside(item.at,hole)))continue;
    const points=loop.map(([x,y])=>[cx+x*c+y*s,cy+x*s-y*c]);
    const key=JSON.stringify(points.map(point=>point.map(value=>Math.round(value*10000)/10000)));if(drilled.has(key))continue;
    if(drillCount>=1024||drillPoints+points.length>100000||!outer||!drillLoopInsideBoard(points.map(([x,y])=>[x+centerX,centerY-y]),outer,outlineHoles)){omittedDrills++;continue;}
    drilled.add(key);drillCount++;drillPoints+=points.length;shape.holes.push(pathFor(points,point=>point));
  }
  if(omittedDrills)geometryDiagnostics.push(`${omittedDrills} drill loops could not be cut within the saved-geometry/triangulation budget.`);
  const substrate = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 8 }),
    [new THREE.MeshPhysicalMaterial(studioMaterials.solderMask),
      new THREE.MeshStandardMaterial(studioMaterials.substrateEdge)]);
  substrate.position.z = bottom;
  substrate.receiveShadow = true;presentation.addCaster(substrate);
  substrate.userData.record = { type: "Board", name: "Substrate", layer: "Edge.Cuts", id: "board" };
  substrate.userData.identity = viewportSceneIdentity("substrate", "Edge.Cuts", "board");
  boardGroup.add(substrate); pickables.push(substrate);translucency.add(substrate,'substrate');
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(substrate.geometry, 20),
    new THREE.LineBasicMaterial({ color: 0x9bb7ac, transparent: true, opacity: .42 }));
  edges.position.z = bottom; boardGroup.add(edges);
  const silkGroup=new THREE.Group();boardGroup.add(silkGroup);
  const silkDetail=createSilkscreenDetail(THREE,{camera,document,bounds:board.bounds,centerX,centerY,graphics,resources,invalidate,arcThrough:globalThis.KiCadOwnedCanvas?.arcThrough,onError:error=>graphicsNotice("Silkscreen detail could not be refreshed: "+error.message)});
  if(globalThis.KiCadPCBRenderer&&globalThis.KiCadOwnedCanvas?.arcThrough){
    try{
      const silk=globalThis.KiCadPCBRenderer.build(silkscreenSource(sourceAST),options.boardPath||'').primitives.filter(primitive=>!primitive.frame&&!primitive.hidden&&['F.SilkS','B.SilkS'].includes(primitive.layer));
      const plan=silkscreenPlan(width,height,graphics.maxDimension,graphics.constrained),points=shape.extractPoints(8);
      const clips=[points.shape,...points.holes].map(loop=>loop.map(point=>[point.x+centerX,centerY-point.y]));
      for(const layer of ['F.SilkS','B.SilkS']){
        const primitives=silk.filter(primitive=>primitive.layer===layer);if(!primitives.length||!plan)continue;
        const canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
        const context=canvas.getContext('2d');if(!context)continue;
        paintSilkscreen(context,primitives,board.bounds,plan,clips,globalThis.KiCadOwnedCanvas.arcThrough);
        const texture=resources.track(new THREE.CanvasTexture(canvas));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map:texture,color:0xffffff,roughness:.85,metalness:0,side:layer==='F.SilkS'?THREE.FrontSide:THREE.BackSide,transparent:true,alphaTest:.05,depthWrite:false}));
        mesh.position.z=layer==='F.SilkS'?top+.055:bottom-.055;mesh.renderOrder=1;
        silkGroup.add(mesh);translucency.add(mesh,'silkscreen');visibilityRecord(mesh,'silkscreen',layer);silkDetail.add(mesh,primitives,clips,layer==='F.SilkS');
      }
    }catch(error){geometryDiagnostics.push('Saved silkscreen could not be prepared: '+error.message);}
  }

  function buildCopperLayer(layer,z){
    if(renderedCopperLayers.has(layer))return;renderedCopperLayers.add(layer);const color=layerThreeColor(layer),internal=!['F.Cu','B.Cu'].includes(layer);
    for(const category of ['tracks','arcs']){
    const tracks = board.tracks.filter((item) => item.layer === layer&&(isArc(item)?'arcs':'tracks')===category);
    // Rectangle centerline body + two circular endpoint discs. Scaling a
    // prebuilt capsule stretches its circles; scaling a rectangle to the
    // capsule's total length instead produces the old square spikes at joins.
    const material=new THREE.MeshStandardMaterial({color,...studioMaterials.copper,...copperSurfaceMaterial});
    for(const section of ['body','start','end']){
      const geometry=section==='body'?new THREE.PlaneGeometry(1,1):new THREE.CircleGeometry(.5,32);
      const mesh=makeInstanced(groupFor(layer),geometry,material,tracks,(object,track)=>{
        const a=world(track.start),b=world(track.end),plan=trackStrokePlan(a,b,track.width);
        if(!plan){object.scale.set(0,0,0);return;}
        const at=section==='body'?plan.center:section==='start'?a:b;
        object.position.set(at[0],at[1],z);object.rotation.set(0,0,section==='body'?plan.angle:0);
        object.scale.set(section==='body'?plan.length:plan.width,plan.width,1);
      },viewportSceneIdentity('copper-track',layer,category+'-'+section));
      if(mesh){visibilityRecord(mesh,category,layer);pickables.push(mesh);appearanceRecords.push({mesh,role:'tracks',layer});}
    }
    }
    const pads = nativePads.filter((item) => item.layer === layer || item.layers?.includes(layer)||item.layers?.includes('*.Cu'));
    const batches=new Map();let omittedPads=0;
    for(const pad of pads){const outline=nativePadOutline(pad);if(!outline){omittedPads++;continue;}const key=JSON.stringify([pad.shape,pad.width,pad.height,pad.roundrectRatio,pad.drill,pad.drillShape,pad.drillWidth,pad.drillHeight,pad.drillOffset]);if(!batches.has(key)){if(batches.size>=256){omittedPads++;continue;}batches.set(key,{outline,pads:[]});}batches.get(key).pads.push(pad);}
    if(omittedPads)geometryDiagnostics.push(`${layer}: ${omittedPads} unsupported/ambiguous pad shapes omitted; no rectangular stand-ins were substituted.`);
    const padMaterial=new THREE.MeshStandardMaterial({color:0xffffff,...studioMaterials.copper,...copperSurfaceMaterial});
    for(const [key,batch]of batches){const geometry=internal?new THREE.ShapeGeometry(padShape(batch.outline)):new THREE.ExtrudeGeometry(padShape(batch.outline),{depth:.04,bevelEnabled:false,curveSegments:8});
      const padMesh=makeInstanced(groupFor(layer),geometry,padMaterial,batch.pads,(object,pad)=>{const[x,y]=world(pad.at);object.position.set(x,y,internal?z:z-.02);object.rotation.z=(pad.rotation||0)*Math.PI/180;},viewportSceneIdentity('copper-pad',layer,key));
      if(padMesh){visibilityRecord(padMesh,'pads',layer);pickables.push(padMesh);appearanceRecords.push({mesh:padMesh,role:'pads',layer,pads:batch.pads});}
    }
    for (const zone of savedZones.records.filter((item) => item.layer === layer)) {
      if (zone.points.length < 3) continue;
      if(!zone.filled){const geometry=new THREE.BufferGeometry().setFromPoints(zone.points.map(point=>{const [x,y]=world(point);return new THREE.Vector3(x,y,z);}));const boundary=new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({color:layerThreeColor(layer),transparent:true,opacity:.6}));groupFor(layer).add(boundary);visibilityRecord(boundary,'polygons',layer);continue;}
      const zoneShape = new THREE.Shape();
      pathFor(zone.points, world).getPoints().forEach((point, index) => {
        if (index === 0) zoneShape.moveTo(point.x, point.y); else zoneShape.lineTo(point.x, point.y);
      });
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(zoneShape),
        new THREE.MeshStandardMaterial({color,...studioMaterials.copper,...copperSurfaceMaterial}));
      mesh.position.z = z - (layer === "F.Cu" ? .005 : -.005); mesh.userData.record = { ...zone, type: "Zone" };
      groupFor(layer).add(mesh);visibilityRecord(mesh,'fills',layer); pickables.push(mesh);
      appearanceRecords.push({mesh,role:'zone',layer});translucency.add(mesh,'zone');
    }
  }
  for(const layer of copperPlan.filter(layer=>!layer.internal))buildCopperLayer(layer.name,layer.z);
  function ensureInternalCopper(){
    const layers=copperPlan.filter(layer=>layer.internal&&!renderedCopperLayers.has(layer.name));if(!layers.length)return;
    const zones=sourceZoneGeometry(sourceAST,1000,500000,layers.map(layer=>layer.name));savedZones.records.push(...zones.records);
    for(const layer of layers)buildCopperLayer(layer.name,layer.z);resources.retain(boardGroup);
    if(layers.some(layer=>layer.basis==='illustrative'))modelDiagnostics.push('Internal copper has saved XY coordinates and layer order; elevations are illustrative because a complete saved stackup is unavailable.');
    if(zones.truncated)modelDiagnostics.push('Internal copper reached the saved polygon/point budget; additional fills are omitted.');
    showModelDiagnostics();
  }
  const viaBatches=new Map();let omittedVias=0;
  for(const via of throughVias){const outline=nativePadOutline({shape:'circle',width:via.size,height:via.size,drill:via.drill,drillShape:'circle'});if(!outline){omittedVias++;continue;}const key=JSON.stringify([via.size,via.drill]);if(!viaBatches.has(key)){if(viaBatches.size>=128){omittedVias++;continue;}viaBatches.set(key,{outline,vias:[]});}viaBatches.get(key).vias.push(via);}
  if(omittedVias)geometryDiagnostics.push(`${omittedVias} unsupported via annuli omitted.`);
  const viaMaterial=new THREE.MeshStandardMaterial({color:physicalColors.exposedCopper,...studioMaterials.copper});
  for(const[key,batch]of viaBatches){const geometry=new THREE.ExtrudeGeometry(padShape(batch.outline),{depth:thickness+.08,bevelEnabled:false,curveSegments:8});const mesh=makeInstanced(boardGroup,geometry,viaMaterial,batch.vias,(object,via)=>{const[x,y]=world(via.at);object.position.set(x,y,bottom-.04);},viewportSceneIdentity('via-barrel','through',key));if(mesh){visibilityRecord(mesh,'vias','through');pickables.push(mesh);}}
  const parts = new THREE.Group(); boardGroup.add(parts);
  const proxyPoses = footprintProxies(board);
  const componentMesh = makeInstanced(parts, new RoundedBoxGeometry(1, 1, 1, 2, .06),
    new THREE.MeshStandardMaterial(studioMaterials.proxy), board.components,
    (object, part) => { const pose = proxyPoses.get(part); const [x, y] = world(pose?.at || part.at); const below = part.layer?.startsWith("B.");
      object.position.set(x, y, below ? bottom - 1.1 : top + 1.1);
      object.rotation.set(0, 0, pose?.rotation || 0);
      object.scale.set(pose?.width || 0, pose?.height || 0, pose ? 2.1 : 0); },
    viewportSceneIdentity("component", "F.Fab", "proxies"));
  if (componentMesh) {pickables.push(componentMesh);translucency.add(componentMesh,'component');}
  if (componentMesh) { componentMesh.castShadow = true; componentMesh.receiveShadow = true; }
  const componentIndexes = uniqueComponentIndexes(board.components);
  const componentMatrices = board.components.map((_, index) => {
    const matrix = new THREE.Matrix4();
    componentMesh?.getMatrixAt(index, matrix);
    return matrix;
  });
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const modelGroups = new Map(), loadedModelIndexes = new Set();
  let stepClient=null;
  let population = board.components.map(() => true);
  function updateComponentVisibility() {
    board.components.forEach((_, index) => componentMesh?.setMatrixAt(index,
      population[index] && objectVisibility.visible('bodies',board.components[index].layer) && !loadedModelIndexes.has(index) ? componentMatrices[index] : hiddenMatrix));
    if (componentMesh) { componentMesh.instanceMatrix.needsUpdate = true; componentMesh.computeBoundingSphere(); }
    for (const [index, group] of modelGroups) group.visible = population[index]&&objectVisibility.visible('bodies',board.components[index].layer);
    renderer.shadowMap.needsUpdate=true;
    invalidate();
  }
  const modelDiagnostics = Array.isArray(options.assetWarnings)
    ? options.assetWarnings.filter(item => typeof item === "string").slice(0, 48).map(item => item.slice(0, 500)) : [];
  if(savedZones.unfilled)modelDiagnostics.push(`${savedZones.unfilled} zones have no saved copper fill; only their boundaries are shown.`);
  if(savedZones.truncated)modelDiagnostics.push('Saved zone display reached its polygon/point budget; additional copper is omitted.');
  modelDiagnostics.push(...geometryDiagnostics);
  showModelDiagnostics();
  let modelUpdateCPUms=0;
  const modelUpdates=createUpdateBatch(()=>{if(!active)return;const start=performance.now();try{updateComponentVisibility();refreshClippingBounds();setSelection(externalSelection);showModelDiagnostics();}finally{modelUpdateCPUms+=performance.now()-start;}},invalidate);
  function showModelDiagnostics() {
    const resolved = loadedModelIndexes.size;
    const problems = modelDiagnostics.length;
    notice.replaceChildren(document.createTextNode(`Material preview · linked models ${resolved}/${board.components.length}`));
    const details=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ul');summary.textContent=problems?`${problems} rendering notes`:'Rendering details';
    const messages=['Mask openings follow saved pad layer flags; this is not a reconstructed solder-mask solid.',(board.components.length-resolved)+' footprints have no linked model; bounded stand-ins are used only where usable saved footprint bounds exist.',...modelDiagnostics];
    for(const message of messages){const row=document.createElement('li');row.textContent=message;list.append(row);}details.append(summary,list);notice.append(details);
    options.onDiagnostics?.(['Linked component models: '+resolved+'/'+board.components.length,...messages]);
    notice.title = modelDiagnostics.join("\n");
  }
  function glbIsSelfContained(bytes) {
    if (bytes.byteLength < 20) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
        view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) return false;
    const length = view.getUint32(12, true);
    if (length > bytes.byteLength - 20) return false;
    let descriptor;
    try { descriptor = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))); }
    catch { return false; }
    return [...(descriptor.buffers || []), ...(descriptor.images || [])]
      .every(item => !item.uri || /^data:/i.test(item.uri));
  }
  async function sceneFromAsset(entry, asset, consumeBytes) {
    const base64 = asset?.base64;
    if (typeof base64 !== "string" || base64.length > 11_200_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw new Error("invalid or oversized model asset response");
    }
    const bytes = entry.embeddedAsset ? await globalThis.KiCadEmbeddedModels.decode(asset, fzstd.decompress)
      : Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("model asset exceeds 8 MiB");
    consumeBytes(bytes.byteLength);
    if (["step","stp"].includes(entry.format)) {
      stepClient ||=new globalThis.KiCadStepDecoder.Client(new URL("step-worker.js",location.href).href);
      const meshes=await stepClient.decode(bytes), group=new THREE.Group();
      for(const mesh of meshes){
        const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(mesh.positions,3));geometry.setIndex(new THREE.BufferAttribute(mesh.index,1));
        if(mesh.normals)geometry.setAttribute("normal",new THREE.BufferAttribute(mesh.normals,3));else geometry.computeVertexNormals();
        const materials=mesh.groups.map((part,materialIndex)=>{
          geometry.addGroup(part.start,part.count,materialIndex);
          return new THREE.MeshStandardMaterial({color:new THREE.Color(...part.color),roughness:.65,metalness:.1});
        });
        const material=materials.length===1?materials[0]:materials;
        group.add(new THREE.Mesh(geometry,material));
      }
      return resources.retain(group,modelGeometryBudget,modelTextureBudget);
    }
    if (entry.format === "glb") {
      if (!glbIsSelfContained(bytes)) throw new Error("GLB has an external dependency or invalid header");
      return resources.retain((await new GLTFLoader().parseAsync(bytes.buffer, "")).scene,modelGeometryBudget,modelTextureBudget);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/\b(?:Inline|ImageTexture|MovieTexture|AudioClip)\b|\burl\s*(?:\[|\")/i.test(text)) {
      throw new Error("VRML has an external resource reference");
    }
    return resources.retain(new VRMLLoader().parse(text),modelGeometryBudget,modelTextureBudget);
  }
  async function loadRepositoryModels() {
    if (!options.boardPath) return;
    let inventory;
    try { inventory = globalThis.KiCadRepoModels.collect(source, options.boardPath, undefined, options.assetPaths); }
    catch (error) { modelDiagnostics.push(`Cannot read model references: ${error.message}`); showModelDiagnostics(); return; }
    modelDiagnostics.push(...inventory.diagnostics);
    showModelDiagnostics();
    const cache = new Map();
    const componentIndexes=new Map(board.components.map((component,index)=>[component.id,index]));
    let totalBytes = 0, cursor = 0;
    async function one(entry) {
      const index = componentIndexes.get(entry.footprintId);
      if (index === undefined) { modelDiagnostics.push(`${entry.reference}: footprint identity not found`); return; }
      try {
        const key = entry.assetKey || entry.path;
        if (!cache.has(key)) cache.set(key, (async () => {
          const asset = entry.embeddedAsset || await options.loadAsset?.(entry.path);
          if(!active)throw Error('3D viewer closed before model decoding.');
          return sceneFromAsset(entry, asset, bytes => {
            totalBytes += bytes;
            if (totalBytes > 24 * 1024 * 1024) throw new Error("Decoded 3D model assets exceed 24 MiB in this viewer");
          });
        })());
        const template = await cache.get(key);
        if (!active) return;
        const clone = template.clone(true);
        resources.retain(clone,modelGeometryBudget,modelTextureBudget);
        let meshCount = 0;
        clone.traverse(object => {
          if (object.isMesh && object.geometry?.attributes?.position?.count) {
            meshCount++;
            object.castShadow = true; object.receiveShadow = true;
            object.userData.record = { ...board.components[index], type: "Component", modelPath: entry.path };
            translucency.add(object,'component');pickables.push(object);
          }
        });
        if (!meshCount) throw new Error("asset has no drawable mesh");
        const pose = globalThis.KiCadRepoModels.modelPose(entry, centerX, centerY, thickness);
        const group = new THREE.Group();
        group.position.set(...pose.position);
        group.rotation.z = pose.footprintAngle;
        const local = new THREE.Group();
        // KiCad's VRML exporter composes X/Y/Z model rotations before footprint rotation.
        local.rotation.set(...pose.modelRotation, "ZYX");
        local.scale.set(...pose.scale);
        local.add(clone); group.add(local);
        if (!modelGroups.has(index)) {
          const footprintModels = new THREE.Group();
          modelGroups.set(index, footprintModels); parts.add(footprintModels);
        }
        modelGroups.get(index).add(group);
        loadedModelIndexes.add(index);
        if (entry.format === "glb") modelDiagnostics.push(`${entry.reference}: GLB geometry is interpreted in millimetres.`);

      } catch (error) {
        modelDiagnostics.push(`${entry.reference}: ${entry.path}: ${error?.message || String(error)}`);
      }
      modelUpdates.request();
    }
    await Promise.all(Array.from({ length: Math.min(3, inventory.models.length) }, async () => {
      while (cursor < inventory.models.length && active) await one(inventory.models[cursor++]);
    }));
    cache.clear();stepClient?.dispose();stepClient=null;
    if(active) {
      modelUpdates.flush();
      // Fit real model height after asynchronous decoding, but never undo an
      // orbit/zoom the user has already started during loading.
      if (!userAdjustedCamera && loadedModelIndexes.size) fit();
    }
  }

  let fittedRadius = Math.hypot(width, height, thickness + 5) / 2;
  const fittedCenter = new THREE.Vector3(),clipDirection=new THREE.Vector3();
  const fittedBounds=new THREE.Box3().setFromObject(boardGroup);
  function updateClipping() {
    const closest=boxNearDepth(camera.position.toArray(),camera.getWorldDirection(clipDirection).toArray(),fittedBounds.min.toArray(),fittedBounds.max.toArray());
    const range = boardClipRange(camera.position.distanceTo(controls.target), fittedRadius + controls.target.distanceTo(fittedCenter), closest);
    camera.near = range.near; camera.far = presentation.enabled?Math.max(range.far,extent*10):range.far; camera.updateProjectionMatrix();
  }
  function refreshClippingBounds(){fittedBounds.setFromObject(boardGroup);const sphere=fittedBounds.getBoundingSphere(new THREE.Sphere());if(Number.isFinite(sphere.radius)&&sphere.radius>0){fittedRadius=sphere.radius;fittedCenter.copy(sphere.center);}updateClipping();}
  controls.addEventListener("change", updateClipping);
  function sizeViewport() {
    const viewportWidth = Math.max(1, canvasHost.clientWidth), viewportHeight = Math.max(1, canvasHost.clientHeight);
    const plan=qualityViewport(viewportWidth,viewportHeight,globalThis.devicePixelRatio,graphics.maxDimension,quality,graphics),ratio=plan.ratio;
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    renderer.setSize(viewportWidth, viewportHeight, false); camera.aspect = viewportWidth / viewportHeight;
    if(pipeline){pipeline.composer.setPixelRatio(ratio);pipeline.composer.setSize(viewportWidth,viewportHeight);}
    camera.updateProjectionMatrix();
    invalidate();
  }
  function fit(view = 'iso') {
    sizeViewport();
    boardGroup.updateWorldMatrix(true, true);
    const bounds=new THREE.Box3().setFromObject(boardGroup),sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : Math.hypot(width, height, thickness + 5) / 2;
    const center = sphere.radius > 0 ? sphere.center : new THREE.Vector3();
    const preset=boardViewPreset(view),direction = new THREE.Vector3(...preset.direction).normalize();
    const distance = boxFitDistance(bounds.getSize(new THREE.Vector3()).toArray(),direction.toArray(),camera.fov,camera.aspect,.85,preset.up)||sphereFitDistance(radius, camera.fov, camera.aspect) || extent * 3;
    fittedRadius = radius; fittedCenter.copy(center); fittedBounds.copy(bounds);
    controls.maxDistance = Math.max(extent * 8, distance * 4);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.up.fromArray(preset.up); controls.target.copy(center); controls.update(); updateClipping();
  }
  const fitButton = action("Fit", () => {userAdjustedCamera=true;fit();},'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8Z','Fit board to viewport');
  fitButton.classList.add('fit-action');
  const viewSelect=document.createElement('select');viewSelect.className='view-select';viewSelect.title='Choose a board viewing side';viewSelect.setAttribute('aria-label','3D camera view');const viewPrompt=document.createElement('option');viewPrompt.value='';viewPrompt.disabled=true;viewPrompt.textContent='View';viewSelect.append(viewPrompt);
  for(const {id,label}of boardViewPresets){const item=document.createElement('option');item.value=id;item.textContent=label;viewSelect.append(item);}viewSelect.value='';viewSelect.onchange=()=>{userAdjustedCamera=true;fit(viewSelect.value);viewSelect.value='';};bar.append(viewSelect);
  const divider=document.createElement('span');divider.className='divider';divider.setAttribute('aria-hidden','true');bar.append(divider);
  let panMode=false;
  function setPanMode(enabled){panMode=Boolean(enabled);setBoardPanMode(controls,THREE,panMode);panButton.setAttribute('aria-pressed',String(panMode));renderer.domElement.style.cursor=panMode?'grab':'';return panMode;}
  const panButton=action('Pan',()=>{setMeasurementMode(false);setPanMode(!panMode);},'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4','Pan view with left drag');panButton.setAttribute('aria-pressed','false');
  const measureButton=action('Measure',()=>setMeasurementMode(!measuring),'M3 17 17 3l4 4L7 21ZM7 13l3 3M10 10l2 2M13 7l3 3','Measure distance between 3D surfaces');measureButton.setAttribute('aria-pressed','false');
  const displayButton=action('Display',()=>setDisplayOpen(visibilityOptions.hidden),'M3 6h18M3 12h18M3 18h18M7 3v6M17 9v6M10 15v6','3D display settings');displayButton.setAttribute('aria-expanded','false');displayButton.setAttribute('aria-controls',visibilityOptions.id);
  const copperLayerToggles=new Map();
  const visibleCopperLayers=()=>copperPlan.filter(layer=>layerEnabled.get(layer.name)).map(layer=>layer.name);
  function setVisibleCopperLayers(names){
    if(!Array.isArray(names)||names.some(name=>typeof name!=='string'||!layerEnabled.has(name))||new Set(names).size!==names.length)throw new TypeError('Choose saved physical copper layer names.');
    const enabled=new Set(names);let changed=false;
    for(const layer of copperPlan){const visible=enabled.has(layer.name);if(layerEnabled.get(layer.name)!==visible)changed=true;layerEnabled.set(layer.name,visible);const input=copperLayerToggles.get(layer.name);if(input)input.checked=visible;const group=copperGroups.get(layer.name);if(group)group.visible=visible&&(!layer.internal||appearance==='translucent');}
    setSelection(externalSelection);invalidate();const result=visibleCopperLayers();if(changed)options.onLayersChange?.([...result]);return result;
  }
  for(const layer of copperPlan)copperLayerToggles.set(layer.name,toggle(layer.name==='F.Cu'?'Front copper':layer.name==='B.Cu'?'Back copper':layer.name+' copper',true,visible=>{const names=new Set(visibleCopperLayers());if(visible)names.add(layer.name);else names.delete(layer.name);setVisibleCopperLayers([...names]);}));
  toggle("Parts", true, (visible) => { parts.visible = visible; renderer.shadowMap.needsUpdate=true; });
  toggle("Silkscreen", true, visible=>{silkGroup.visible=visible;});
  // A bounded, opt-in set of depth-tested terminal labels. The sprite material
  // preserves board/model occlusion; labels do not participate in picking or fit.
  let showTerminalLabels=false;
  const terminalLabels=new THREE.Group(),terminalLabelCache=new Map();scene.add(terminalLabels);
  const labelGeometry=new THREE.PlaneGeometry(1,1);
  const labelRecords=nativePads.filter(p=>p.name&&p.net&&p.name.length<=40&&p.net.length<=48).slice(0,10000).map(pad=>{const [x,y]=world(pad.at);return{pad,x,y};});
  const labelPool=[],frameTextures=new Set();
  function labelTexture(pad){
    const key=JSON.stringify([pad.name,pad.net]);if(terminalLabelCache.has(key)){const texture=terminalLabelCache.get(key);terminalLabelCache.delete(key);terminalLabelCache.set(key,texture);frameTextures.add(texture);return texture;}
    if(terminalLabelCache.size>=150){const unused=[...terminalLabelCache].find(([,texture])=>!frameTextures.has(texture));if(!unused)return null;terminalLabelCache.delete(unused[0]);unused[1].dispose();}
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=48;
    const ctx=canvas.getContext('2d');ctx.font='600 14px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=5;ctx.strokeStyle='#101820';ctx.fillStyle='#f3f8fa';
    for(const [text,y] of [[pad.name,13],[pad.net,34]]){ctx.strokeText(text,256,y);ctx.fillText(text,256,y);}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;terminalLabelCache.set(key,texture);frameTextures.add(texture);return texture;
  }
  const projectedLabel=new THREE.Vector3(),labelPosition=new THREE.Vector3();
  function updateTerminalLabels(){
    let count=0;frameTextures.clear();terminalLabels.visible=showTerminalLabels&&!measuring;
    if(!terminalLabels.visible)return;
    if(!objectVisibility.visible('pads'))return void labelPool.forEach(mesh=>mesh.visible=false);
    const canvasHeight=Math.max(1,canvasHost.clientHeight),canvasWidth=Math.max(1,canvasHost.clientWidth),boxes=[];
    // Label the facing saved copper surface only; no inferred internal geometry.
    const layer=camera.position.z>=controls.target.z?'F.Cu':'B.Cu';
    if(!groupFor(layer).visible||!objectVisibility.visible('pads',layer))return void labelPool.forEach(mesh=>mesh.visible=false);
    for(const {pad,x,y} of labelRecords){
      if(count>=150)break;
      if(!(pad.layers?.includes(layer)||pad.layers?.includes('*.Cu')||pad.layer===layer))continue;
      const z=layer==='F.Cu'?top+.055:bottom-.055;
      const distance=camera.position.distanceTo(labelPosition.set(x,y,z));
      const pxPerMm=canvasHeight/(2*Math.tan(camera.fov*Math.PI/360)*distance),padPixels=Math.min(pad.width,pad.height)*pxPerMm;
      if(!Number.isFinite(padPixels)||padPixels<32)continue;
      projectedLabel.set(x,y,z).project(camera);if(projectedLabel.z< -1||projectedLabel.z>1)continue;
      const size=Math.min(16,Math.max(10,padPixels*.22)),w=(Math.max(pad.name.length,pad.net.length)*.63+1)*size,h=size*2.8;
      const sx=(projectedLabel.x+1)*canvasWidth/2,sy=(1-projectedLabel.y)*canvasHeight/2,box={x:sx-w/2,y:sy-h/2,w,h};
      if(box.x<0||box.y<0||box.x+w>canvasWidth||box.y+h>canvasHeight||boxes.some(b=>box.x<b.x+b.w&&box.x+w>b.x&&box.y<b.y+b.h&&box.y+h>b.y))continue;
      const texture=labelTexture(pad);if(!texture)continue;
      let mesh=labelPool[count];if(!mesh){mesh=new THREE.Mesh(labelGeometry,new THREE.MeshBasicMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide}));mesh.renderOrder=5;terminalLabels.add(mesh);labelPool.push(mesh);}
      if(mesh.material.map!==texture){mesh.material.map=texture;mesh.material.needsUpdate=true;}mesh.position.set(x,y,z);mesh.quaternion.copy(camera.quaternion);
      // Canvas glyphs occupy 14 px of a 512 px texture width.
      mesh.scale.set(512/14*size/pxPerMm,48/14*size/pxPerMm,1);mesh.visible=true;boxes.push(box);count++;
    }
    for(let i=count;i<labelPool.length;i++)labelPool[i].visible=false;
  }
  toggle('Pad and net names (close zoom)',false,visible=>{showTerminalLabels=visible;});

  fit();

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const measurementSession=new MeasurementSession();let measuring=false,measurementUnit='mm';
  const measurementPanel=document.createElement('section');measurementPanel.className='measurement-panel';measurementPanel.hidden=true;measurementPanel.setAttribute('aria-label','3D surface measurement');
  const measurementHeading=document.createElement('div');measurementHeading.className='measurement-heading';
  const measurementTitle=document.createElement('strong');measurementTitle.textContent='Surface distance';
  const measurementUnits=document.createElement('select');measurementUnits.setAttribute('aria-label','3D measurement units');for(const unit of ['mm','mil']){const option=document.createElement('option');option.value=unit;option.textContent=unit;measurementUnits.append(option);}
  const measurementExit=document.createElement('button');measurementExit.type='button';measurementExit.textContent='Done';measurementExit.title='Exit measurement mode';measurementExit.onclick=()=>setMeasurementMode(false);
  measurementHeading.append(measurementTitle,measurementUnits,measurementExit);
  const measurementSnap=document.createElement('select'),measurementFilter=document.createElement('select'),measurementSelection=document.createElement('div');measurementSelection.className='measurement-tools';measurementSnap.setAttribute('aria-label','3D measurement snap');measurementFilter.setAttribute('aria-label','3D measurement selection filter');
  for(const [value,label]of [['surface','Surface'],['edges','Snap to edges'],['corners','Snap to corners']]){const option=document.createElement('option');option.value=value;option.textContent=label;measurementSnap.append(option);}
  for(const [value,label]of [['all','All geometry'],['board','Board outline/body'],['models','Component models'],['pads','Pads'],['tracks','Tracks'],['vias','Vias']]){const option=document.createElement('option');option.value=value;option.textContent=label;measurementFilter.append(option);}measurementSelection.append(measurementSnap,measurementFilter);
  const measurementEdges=new WeakMap();let measurementTouch=null,measurementTouchDrag=null;const measurementPointers=new Set();
  const measurementLens=document.createElement('canvas');measurementLens.width=measurementLens.height=240;measurementLens.className='measurement-label';measurementLens.hidden=true;measurementLens.setAttribute('aria-label','3D measurement magnifier');measurementLens.style.cssText='width:120px;height:120px;position:absolute;right:12px;top:50px;left:auto;pointer-events:none;border-radius:50%;z-index:8;padding:0';stage.append(measurementLens);
  function drawMeasurementLens(){if(!measuring||!measurementTouch){measurementLens.hidden=true;return;}const rect=renderer.domElement.getBoundingClientRect(),x=measurementTouch.x-rect.left,y=measurementTouch.y-rect.top;measurementLens.hidden=false;const ctx=measurementLens.getContext('2d');if(!ctx)return;const ratioX=renderer.domElement.width/rect.width,ratioY=renderer.domElement.height/rect.height;ctx.clearRect(0,0,240,240);ctx.drawImage(renderer.domElement,(x-20)*ratioX,(y-20)*ratioY,40*ratioX,40*ratioY,0,0,240,240);ctx.strokeStyle='#ffcf66';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(110,120);ctx.lineTo(130,120);ctx.moveTo(120,110);ctx.lineTo(120,130);ctx.stroke();}

  const measurementOutput=document.createElement('output');measurementOutput.setAttribute('aria-live','polite');
  const measurementStatus=document.createElement('p');measurementStatus.setAttribute('role','status');
  const measurementDelta=document.createElement('small'),measurementDisclaimer=document.createElement('small');measurementDisclaimer.textContent='Model surfaces · footprint stand-ins are approximate.';
  const measurementTools=document.createElement('div');measurementTools.className='measurement-tools';
  const measurementHistory=document.createElement('select');measurementHistory.setAttribute('aria-label','Recent 3D measurements');
  const measurementClear=document.createElement('button');measurementClear.type='button';measurementClear.textContent='Clear';measurementClear.title='Clear all 3D measurements';measurementClear.onclick=clearMeasurements;
  measurementTools.append(measurementHistory,measurementClear);measurementPanel.append(measurementHeading,measurementSelection,measurementOutput,measurementStatus,measurementDelta,measurementTools,measurementDisclaimer);stage.append(measurementPanel);
  const measurementLabel=document.createElement('div');measurementLabel.className='measurement-label';measurementLabel.hidden=true;measurementLabel.setAttribute('aria-hidden','true');stage.append(measurementLabel);
  const measureGroup=new THREE.Group();measureGroup.visible=false;scene.add(measureGroup);
  const measureGeometry=new THREE.BufferGeometry();measureGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
  const measureMaterial=new THREE.LineBasicMaterial({color:0xffd37a,transparent:true,opacity:.95,depthTest:false,depthWrite:false,toneMapped:false});
  const measureLine=new THREE.Line(measureGeometry,measureMaterial);measureLine.frustumCulled=false;measureLine.renderOrder=201;measureGroup.add(measureLine);
  const markerGeometry=new THREE.SphereGeometry(1,12,8),markerMaterial=new THREE.MeshBasicMaterial({color:0xffd37a,transparent:true,opacity:.95,depthTest:false,depthWrite:false,toneMapped:false});
  const measureMarkers=[new THREE.Mesh(markerGeometry,markerMaterial),new THREE.Mesh(markerGeometry,markerMaterial)];for(const marker of measureMarkers){marker.renderOrder=202;measureGroup.add(marker);}
  const toWorld=point=>new THREE.Vector3(point.x-centerX,centerY-point.y,point.z);
  function updateMeasurementPanel(message){
    const current=measurementSession.selected,pending=measurementSession.pending;
    measurementOutput.textContent=current?(current.approximate?'≈ ':'')+distanceLabel(current.distance,measurementUnit):'—';
    measurementStatus.textContent=message||(pending?'Choose the second surface point.':current?'Choose a point to start another measurement.':'Choose the first surface point.');
    const signed=value=>(measurementUnit==='mil'?value/.0254:value).toFixed(measurementUnit==='mil'?2:3);
    measurementDelta.textContent=current?`ΔX ${signed(current.delta.x)} · ΔY ${signed(current.delta.y)} · ΔZ ${signed(current.delta.z)} ${measurementUnit}`:'';
    measurementHistory.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent=measurementSession.records.length?'Recent measurements':'No measurements yet';measurementHistory.append(prompt);
    for(const record of measurementSession.records){const option=document.createElement('option');option.value=String(record.id);option.textContent=`#${record.id} · ${record.approximate?'≈ ':''}${distanceLabel(record.distance,measurementUnit)}`;measurementHistory.append(option);}measurementHistory.value=current?String(current.id):'';measurementHistory.disabled=!measurementSession.records.length;
    measurementLabel.textContent=current?(current.approximate?'≈ ':'')+distanceLabel(current.distance,measurementUnit):'';
    updateMeasurementGraphics();invalidate();
  }
  function updateMeasurementGraphics(){
    const current=measurementSession.selected,pending=measurementSession.pending;measureGroup.visible=measuring&&Boolean(current||pending);measurementLabel.hidden=!measuring||!current;
    if(!measureGroup.visible)return;const from=toWorld(current?.from||pending),to=current?toWorld(current.to):null;measureMarkers[0].position.copy(from);measureMarkers[1].visible=Boolean(to);measureLine.visible=Boolean(to);
    if(to){measureMarkers[1].position.copy(to);const positions=measureGeometry.getAttribute('position');positions.setXYZ(0,from.x,from.y,from.z);positions.setXYZ(1,to.x,to.y,to.z);positions.needsUpdate=true;
      const center=from.clone().add(to).multiplyScalar(.5).project(camera);measurementLabel.hidden=center.z<-1||center.z>1;
      measurementLabel.style.left=Math.max(8,Math.min(canvasHost.clientWidth-measurementLabel.offsetWidth-8,(center.x+1)*canvasHost.clientWidth/2+8))+'px';measurementLabel.style.top=Math.max(8,Math.min(canvasHost.clientHeight-measurementLabel.offsetHeight-8,(1-center.y)*canvasHost.clientHeight/2-24))+'px';
    }
    for(const marker of measureMarkers){const radius=Math.max(.005,camera.position.distanceTo(marker.position)*2*Math.tan(camera.fov*Math.PI/360)/Math.max(1,canvasHost.clientHeight)*3.5);marker.scale.setScalar(radius);}
  }
  function setMeasurementMode(enabled){if(!active)return false;measuring=Boolean(enabled);if(measuring)setPanMode(false);host.dataset.measuring=String(measuring);measureButton.setAttribute('aria-pressed',String(measuring));measurementPanel.hidden=!measuring;if(!measuring){measurementSession.pending=null;measurementTouch=null;measurementTouchDrag=null;measurementPointers.clear();controls.enabled=true;measurementLens.hidden=true;}updateMeasurementPanel();options.onMeasurementMode?.(measuring);return measuring;}
  function clearMeasurements(){measurementSession.clear();updateMeasurementPanel();options.onMeasurement?.(null);}
  measurementUnits.onchange=()=>{measurementUnit=measurementUnits.value==='mil'?'mil':'mm';updateMeasurementPanel();};
  measurementHistory.onchange=()=>{const record=measurementSession.replay(measurementHistory.value);if(record){updateMeasurementPanel();options.onMeasurement?.(record);}};
  const escapeMeasurement=event=>{if(event.key==='Escape'&&measuring){event.preventDefault();event.stopPropagation();setMeasurementMode(false);measureButton.focus();}};
  shadow.addEventListener('keydown',escapeMeasurement);
  function measurementPoint(){
    const visible=item=>inspectionTarget(item,substrate,appearance);
    const hit=raycaster.intersectObjects(pickables.filter(visible),false).find(hit=>selectionAppearance.isVisible(hit.object,hit.instanceId));if(!hit)return null;
    const rawCategory=hit.object===substrate?'board':visibilityRecords.find(record=>record.mesh===hit.object)?.type||'models',category=rawCategory==='arcs'?'tracks':rawCategory;
    if(measurementFilter.value!=='all'&&measurementFilter.value!==category)return null;
    if(measurementSnap.value==='surface')return{point:hit.point,approximate:hit.object===componentMesh,kind:'surface'};
    const geometry=hit.object.geometry,positions=geometry?.getAttribute('position');if(!positions||positions.count>200000)return null;
    let edges=measurementEdges.get(geometry);if(!edges){const wire=new THREE.EdgesGeometry(geometry,25),p=wire.getAttribute('position');edges=[];for(let i=0;i+1<p.count&&edges.length<10000;i+=2)edges.push([[p.getX(i),p.getY(i),p.getZ(i)],[p.getX(i+1),p.getY(i+1),p.getZ(i+1)]]);wire.dispose();measurementEdges.set(geometry,edges);}
    const matrix=hit.object.matrixWorld.clone();if(Number.isInteger(hit.instanceId)){const instance=new THREE.Matrix4();hit.object.getMatrixAt(hit.instanceId,instance);matrix.multiply(instance);}
    const transformed=edges.map(edge=>edge.map(p=>{const v=new THREE.Vector3(...p).applyMatrix4(matrix);return{x:v.x,y:v.y,z:v.z};})),rect=renderer.domElement.getBoundingClientRect();
    const project=p=>{const clip=new THREE.Vector4(p.x,p.y,p.z,1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);if(clip.w<=0)return null;return{x:(clip.x/clip.w+1)*rect.width/2,y:(1-clip.y/clip.w)*rect.height/2,z:clip.z/clip.w,w:clip.w};};
    const result=snapProjectedEdges({x:(pointer.x+1)*rect.width/2,y:(1-pointer.y)*rect.height/2},transformed,project,{mode:measurementSnap.value,tolerance:measurementTouch?18:12});if(!result)return null;
    const point=new THREE.Vector3(result.point.x,result.point.y,result.point.z),screen=point.clone().project(camera),checkRay=new THREE.Raycaster();checkRay.setFromCamera(new THREE.Vector2(screen.x,screen.y),camera);const first=checkRay.intersectObjects(pickables.filter(visible),false).find(hit=>selectionAppearance.isVisible(hit.object,hit.instanceId));
    if(!first||first.object!==hit.object||first.instanceId!==hit.instanceId||first.point.distanceTo(point)>Math.max(.002,camera.position.distanceTo(point)*.00005))return null;
    return{point,approximate:hit.object===componentMesh,kind:result.kind};
  }
  function measureSurface(){
    const hit=measurementPoint();if(!hit){updateMeasurementPanel('No visible feature within snap range. Adjust snap/filter or zoom in.');return;}
    const result=measurementSession.add({x:hit.point.x+centerX,y:centerY-hit.point.y,z:hit.point.z,approximate:hit.approximate});
    updateMeasurementPanel(hit.kind+' selected. '+(measurementSession.pending?'Choose the second point.':'Measurement complete.'));if(result?.distance!==undefined)options.onMeasurement?.(result);
  }
  let selected = null;
  const gesture = tapGesture();
  let selectionDim=true,selectionDisplayStyle=selectionStyle();
  const selectionAppearance=createSelectionAppearance(THREE,()=>{const objects=[];boardGroup.traverse(object=>{if(object.material)objects.push(object);});return objects;});
  selectionAppearanceReady=true;
  const selectionLimit = 2000;
  // Draw only the twelve box edges, never the triangles of a solid cube.
  const outlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const unitEdges = outlineGeometry.getAttribute('position');
  const groupGeometry = new THREE.BufferGeometry();
  const groupPositions = new THREE.BufferAttribute(new Float32Array(selectionLimit * unitEdges.count * 3), 3);
  groupPositions.setUsage(THREE.DynamicDrawUsage); groupGeometry.setAttribute('position', groupPositions);
  groupGeometry.setDrawRange(0, 0);
  const outlineMaterial = () => new THREE.LineBasicMaterial({ color: initialDark ? 0xffdf7d : 0x9b5500,
    depthTest: true, depthWrite: false, toneMapped: false });
  const groupHighlight = new THREE.LineSegments(groupGeometry, outlineMaterial());
  groupHighlight.frustumCulled = false; groupHighlight.renderOrder = 101;
  scene.add(groupHighlight);
  let externalSelection = {};
  const selectionNotice = document.createElement('div'); selectionNotice.className = 'hint'; selectionNotice.style.bottom = '42px'; selectionNotice.hidden = true; stage.append(selectionNotice);
  function setSelection(selection = {}) {
    invalidate();
    externalSelection = selection || {};
    if(!hasSavedSelection(externalSelection)){groupGeometry.setDrawRange(0,0);selectionNotice.hidden=true;selectionNotice.style.display='none';highlight.visible=false;groupHighlight.visible=false;selectionAppearance.restore();return{highlighted:0,matched:0,limited:false};}
    const matches = selectionMatcher(externalSelection, board);
    const matrix = new THREE.Matrix4(), local = new THREE.Matrix4(), box = new THREE.Box3();
    const center = new THREE.Vector3(), size = new THREE.Vector3();
    let count = 0, total = 0;
    const selectedBounds = new Map();
    const append = (object, instanceId, record) => {
      if (Number.isInteger(instanceId)) {
        object.getMatrixAt(instanceId, local);
        if (local.determinant() === 0) return;
      }

      object.updateWorldMatrix(true, false);
      if (Number.isInteger(instanceId)) {
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox(); box.copy(object.geometry.boundingBox);
        matrix.multiplyMatrices(object.matrixWorld, local); box.applyMatrix4(matrix);
      } else box.setFromObject(object);
      if (box.isEmpty()) return;
      const key = record?.ref ? 'part:' + record.ref : record?.uuid || record?.id || object.uuid + ':' + instanceId;
      if (selectedBounds.has(key)) selectedBounds.get(key).union(box);
      else if (selectedBounds.size < selectionLimit) selectedBounds.set(key, box.clone());
      else total++;

    };
    for (const object of pickables) {
      let visible = true; for (let node = object; node; node = node.parent) if (!node.visible) visible = false;
      if (!visible) continue;
      const records = object.userData.records;
      if (records) records.forEach((record, index) => { if (matches(record)) append(object, index, record); });
      else if (matches(object.userData.record)) append(object, undefined, object.userData.record);
    }
    for (const box of selectedBounds.values()) {
      box.expandByScalar(.035); box.getCenter(center); box.getSize(size);
      for (let i = 0; i < unitEdges.count; i++) groupPositions.setXYZ(count * unitEdges.count + i,
        center.x + unitEdges.getX(i) * size.x, center.y + unitEdges.getY(i) * size.y, center.z + unitEdges.getZ(i) * size.z);
      count++;
    }
    total += selectedBounds.size;
    groupGeometry.setDrawRange(0, count * unitEdges.count); groupPositions.needsUpdate = true;
    selectionNotice.hidden = total <= selectionLimit;
    selectionNotice.textContent = `Showing ${count} of ${total} selected 3D objects`;
    selectionNotice.style.display = total > selectionLimit ? 'block' : 'none';
    highlight.visible = false;
    const netNames=new Set(externalSelection.netNames||[]);
    groupHighlight.visible=!netNames.size;
    selectionAppearance.update(matches,total>0&&selectionDim,netNames.size?record=>netNames.has(record?.net):null,selectionDisplayStyle);
    return { highlighted: count, matched: total, limited: total > selectionLimit };
  }
  const highlight = new THREE.LineSegments(outlineGeometry, outlineMaterial());
  highlight.matrixAutoUpdate = false;
  highlight.renderOrder = 100;
  highlight.visible = false;
  scene.add(highlight);
  const instanceMatrix = new THREE.Matrix4(), bounds = new THREE.Box3();
  const highlightCenter = new THREE.Vector3(), highlightSize = new THREE.Vector3();
  function showHighlight(object, instanceId) {
    invalidate();
    object.updateWorldMatrix(true, false);
    if (Number.isInteger(instanceId)) {
      object.getMatrixAt(instanceId, instanceMatrix);
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      bounds.copy(object.geometry.boundingBox).applyMatrix4(instanceMatrix).applyMatrix4(object.matrixWorld);
    } else bounds.setFromObject(object);
    if (bounds.isEmpty()) { highlight.visible = false; return; }
    bounds.expandByScalar(.035);
    bounds.getCenter(highlightCenter); bounds.getSize(highlightSize);
    highlight.matrix.compose(highlightCenter, new THREE.Quaternion(), highlightSize);
    highlight.matrixWorldNeedsUpdate = true;
    highlight.visible = true;
  }
  function clearSelection() {
    selected = null; inspector.hidden = true; menu.hidden = true; highlight.visible = false;
    setSelection({});
    options.onSelect?.(null);
  }
  function select(record, point, object, instanceId) {
    const mode=options.getSelectionMode?.()||selectionMode;
    setSelection(mode==='net'&&record.net?{netNames:[record.net]}:record.type==='Component'||typeof record.library==='string'?{references:[record.ref]}:{uuids:[record.uuid||record.id]});
    selected = { record, point: point.clone() };
    groupGeometry.setDrawRange(0, 0);
    if(mode!=='net'||!record.net)showHighlight(object, instanceId);else highlight.visible=false;
    options.onSelect?.(record);
    inspector.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = record.ref || record.name || record.type || "Board object";
    const list = document.createElement("dl");
    for (const [label, value] of Object.entries({ Type: record.type || (record.ref ? "Component" : "Copper"),
      Reference: record.ref, Value: record.value, Layer: record.layer || record.layers?.join(", "), Net: record.net,
      Model: record.modelPath || record.modelPaths?.join(", ") })) {
      if (value == null || value === "") continue;
      const term = document.createElement("dt"), desc = document.createElement("dd");
      term.textContent = label; desc.textContent = String(value); list.append(term, desc);
    }
    inspector.append(heading, list); inspector.hidden = Boolean(options.externalInspector);
  }
  const demoSurfaces=createDemoSurfaces(THREE,{scene,objects:()=>pickables,document,invalidate});
  const demoFaceHint=document.createElement('div');demoFaceHint.hidden=true;demoFaceHint.setAttribute('role','status');demoFaceHint.style.cssText='position:absolute;left:12px;right:12px;bottom:12px;z-index:8;padding:9px 12px;border:1px solid var(--accent);border-radius:7px;background:var(--menu);color:var(--ink);font:12px/1.4 system-ui;max-height:calc(100% - 24px);overflow:auto;pointer-events:none';stage.append(demoFaceHint);
  const demoFaceText=document.createElement('span'),demoFaceCancel=document.createElement('button');demoFaceCancel.type='button';demoFaceCancel.textContent='Cancel';demoFaceCancel.setAttribute('aria-label','Cancel demo face selection');demoFaceCancel.style.cssText='pointer-events:auto;margin-left:10px';demoFaceCancel.onclick=()=>finishDemoFace(new DOMException('Face selection was cancelled.','AbortError'));demoFaceHint.append(demoFaceText,demoFaceCancel);
  let pendingDemoFace=null,demoPointerId=null;
  const demoVisible=object=>inspectionTarget(object,substrate,appearance);
  function demoHit(event,overlays=true){demoSurfaces.sync();const rect=renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height)return null;pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects((overlays?[...pickables,...demoSurfaces.objects()]:pickables).filter(demoVisible),false).find(hit=>selectionAppearance.isVisible(hit.object,hit.instanceId))||null;}
  function finishDemoFace(error,face){const pending=pendingDemoFace;if(!pending)return;pendingDemoFace=null;pending.signal?.removeEventListener('abort',pending.abort);demoFaceHint.hidden=true;renderer.domElement.style.cursor='';if(error)pending.reject(error);else pending.resolve(face);}
  function pickDemoFace({signal}={}){
    if(!active)return Promise.reject(new Error('The 3D view is closed.'));
    if(signal?.aborted)return Promise.reject(new DOMException('Face selection was aborted.','AbortError'));
    finishDemoFace(new DOMException('Face selection was replaced.','AbortError'));cancelDemoPointer();setMeasurementMode(false);
    return new Promise((resolve,reject)=>{const abort=()=>finishDemoFace(new DOMException('Face selection was aborted.','AbortError'));pendingDemoFace={resolve,reject,signal,abort};signal?.addEventListener('abort',abort,{once:true});demoFaceText.textContent='Choose a flat component face for the demo display. Drag to orbit; press Escape to cancel.';demoFaceHint.hidden=false;renderer.domElement.style.cursor='crosshair';renderer.domElement.tabIndex=0;renderer.domElement.focus({preventScroll:true});});
  }
  function cancelDemoPointer(event){if(demoPointerId===null)return;const id=demoPointerId;demoPointerId=null;demoSurfaces.pointer(null,'cancel',{pointerId:id,clientY:event?.clientY||0,cancelled:true});controls.enabled=true;try{renderer.domElement.releasePointerCapture(id);}catch{}}
  function demoPointerDown(event){if(demoPointerId!==null){event.preventDefault();event.stopImmediatePropagation();return;}if(measuring||panMode||pendingDemoFace||event.button!==0)return;const hit=demoHit(event);if(!demoSurfaces.isHit(hit))return;if(!demoSurfaces.pointer(hit,'press',event))return;event.preventDefault();event.stopImmediatePropagation();if(!active||!demoSurfaces.isHit(hit))return;demoPointerId=event.pointerId;controls.enabled=false;renderer.domElement.tabIndex=0;renderer.domElement.focus({preventScroll:true});try{renderer.domElement.setPointerCapture(event.pointerId);}catch{}}
  function demoPointerMove(event){if(demoPointerId!==event.pointerId)return;demoSurfaces.pointer(demoHit(event),'move',event);event.preventDefault();event.stopImmediatePropagation();}
  function demoPointerUp(event){if(demoPointerId!==event.pointerId)return;const id=demoPointerId;demoPointerId=null;demoSurfaces.pointer(demoHit(event),'release',event);controls.enabled=true;try{renderer.domElement.releasePointerCapture(id);}catch{}event.preventDefault();event.stopImmediatePropagation();}
  function demoPointerCancel(event){if(demoPointerId!==event.pointerId)return;cancelDemoPointer(event);event.preventDefault();event.stopImmediatePropagation();}
  const demoKey=event=>{if(event.key==='Escape'&&pendingDemoFace){finishDemoFace(new DOMException('Face selection was cancelled.','AbortError'));event.preventDefault();event.stopImmediatePropagation();}};
  for(const [name,handler]of [['pointerdown',demoPointerDown],['pointermove',demoPointerMove],['pointerup',demoPointerUp],['pointercancel',demoPointerCancel],['lostpointercapture',demoPointerCancel]])renderer.domElement.addEventListener(name,handler,true);
  shadow.addEventListener('keydown',demoKey,true);document.defaultView?.addEventListener('blur',cancelDemoPointer);
  function pick(event) {
    if(pendingDemoFace){try{const hit=demoHit(event,false);finishDemoFace(null,demoSurfaces.selectFace(hit));}catch(error){demoFaceText.textContent=error.message+' Choose another flat component face, or press Escape.';}return;}
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if(measuring){measureSurface();return;}
    if (analysisOverlay?.mesh.visible) {
      const result = analysisOverlay.sample(raycaster.intersectObject(analysisOverlay.mesh, false)[0]);
      if (result) { options.onAnalysisProbe?.(result); return; }
    }
    const visible=item=>inspectionTarget(item,substrate,appearance);
    const hits = raycaster.intersectObjects(pickables.filter(visible), false).filter(hit=>selectionAppearance.isVisible(hit.object,hit.instanceId));
    const mode = options.getSelectionMode?.() || selectionMode;
    const selectable=hit=>selectableRecord(hit.object.userData.records?.[hit.instanceId]||hit.object.userData.record,mode);
    const hit=(appearance==='translucent'&&hits.find(hit=>selectable(hit)&&(hit.object.userData.records?.[hit.instanceId]||hit.object.userData.record)?.type!=='Zone'))||hits.find(selectable);
    if (!hit) { clearSelection(); return; }
    const record = hit.object.userData.records?.[hit.instanceId] || hit.object.userData.record;
    if (!record) return;
    select(record, hit.point, hit.object, hit.instanceId);
  }
  let selectionMode = 'all';
  const hold = holdGesture(event => contextMenu(event));
  const measurementTouchCapture=event=>{if(measuring&&event.pointerType==='touch'&&measurementPointers.size)controls.enabled=true;};renderer.domElement.addEventListener('pointerdown',measurementTouchCapture,true);
  renderer.domElement.addEventListener("pointerdown", (event) => { gesture.down(event); hold.down(event); menu.hidden = true;if(measuring&&event.pointerType==='touch'){measurementPointers.add(event.pointerId);measurementTouchDrag=measurementPointers.size===1?event.pointerId:null;controls.enabled=measurementPointers.size!==1;measurementTouch={x:event.clientX,y:event.clientY};invalidate();} });
  renderer.domElement.addEventListener("pointermove", event => {
    gesture.move(event); hold.move(event);if(measuring&&event.pointerType==='touch'){measurementTouch={x:event.clientX,y:event.clientY};invalidate();}
    if (analysisOverlay && options.onAnalysisHover) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      options.onAnalysisHover(analysisOverlay.mesh.visible ? analysisOverlay.sample(raycaster.intersectObject(analysisOverlay.mesh, false)[0]) : null);
    }
  });
  renderer.domElement.addEventListener("pointercancel", event => { gesture.cancel(event); hold.up(event);measurementPointers.delete(event.pointerId);measurementTouchDrag=null;controls.enabled=true;measurementTouch=null;measurementLens.hidden=true; });
  renderer.domElement.addEventListener("pointerup", (event) => {
    const held = hold.up(event), tapped = gesture.up(event);
    if(measuring&&event.pointerType==='touch'){if(measurementTouchDrag===event.pointerId&&measurementPointers.size===1)pick(event);measurementPointers.delete(event.pointerId);measurementTouchDrag=null;controls.enabled=true;}else if(!held&&tapped){if(event.button===0&&!panMode)pick(event);else if(event.button===2)contextMenu(event);}measurementTouch=null;measurementLens.hidden=true;
  });
  function contextMenu(event) {
    event.preventDefault?.();if(measuring||pendingDemoFace)return;pick(event); if (!selected) return;
    menu.replaceChildren();
    const actions = [["Focus object", () => { controls.target.copy(selected.point); controls.update(); }],
      ["Copy reference", () => navigator.clipboard.writeText(selected.record.ref || selected.record.name || "")]];
    if (typeof options.onInspect === "function") actions.unshift(["Properties", () => options.onInspect(selected.record)]);
    if (typeof options.onComment === "function") actions.push(["Comment on object", () => options.onComment(selected.record)]);
    for (const [label, handler] of actions) {
      const button = document.createElement("button"); button.textContent = label; button.type = "button";
      button.addEventListener("click", () => { handler(); menu.hidden = true; }); menu.append(button);
    }
    const rect = stage.getBoundingClientRect();
    menu.hidden = false;
    menu.style.maxWidth = "calc(100% - 16px)"; menu.style.maxHeight = "calc(100% - 16px)"; menu.style.overflowY = "auto";
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(event.clientX - rect.left, rect.width - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY - rect.top, rect.height - bounds.height - 8))}px`;
  }
  renderer.domElement.addEventListener("contextmenu", event => {
    event.preventDefault(); // Right-click actions are opened only by an unmoved pointerup.
  });
  const resize = sizeViewport;
  const observer = new ResizeObserver(()=>{resize();syncEmbeddedPanelOffset();}); observer.observe(canvasHost); resize();syncEmbeddedPanelOffset();
  let analysisOverlay = null;
  const layoutFrame = requestAnimationFrame(() => { if (active) { resize(); if(!userAdjustedCamera)fit(); } });
  const projectAnchor=createAnchorProjector(THREE,{objects:()=>pickables,camera,rect:()=>renderer.domElement.getBoundingClientRect(),positionToWorld:(position,side)=>{const [x,y]=world([position.x,position.y]);return new THREE.Vector3(x,y,side==='back'?bottom:top);}});
  let activeAnchor=null,anchorSignature='',viewSignature='';
  function notifyAnchor(){if(!activeAnchor)return;const point=projectAnchor(activeAnchor),signature=JSON.stringify(point);if(signature!==anchorSignature){anchorSignature=signature;options.onAnchor?.({anchor:activeAnchor,point});}}
  function notifyView(){const rect=renderer.domElement.getBoundingClientRect(),signature=JSON.stringify([camera.matrixWorld.elements,camera.projectionMatrix.elements,rect.left,rect.top,rect.width,rect.height]);if(signature!==viewSignature){viewSignature=signature;options.onViewChange?.();}notifyAnchor();}
  function drawFrame(){frame=0;if(!active||contextLost||document.hidden)return;modelUpdates.flush();controls.update();silkDetail.sync();demoSurfaces.sync();if(demoPointerId!==null&&!demoSurfaces.hasActivePointer)cancelDemoPointer();updateMeasurementGraphics();updateTerminalLabels();
    let rendered=false;try{
      if(pipeline){pipeline.composer.render();if(shaderFailure||renderer.getContext().getError()!==renderer.getContext().NO_ERROR)throw Error('Enhanced rendering failed.');}
      else renderer.render(scene,camera);
      renderCount++;rendered=true;
    }catch{
      if(pipeline){fallbackQuality('Enhanced rendering could not complete. Balanced rendering is active.');invalidate();}
      else graphicsNotice('The graphics device could not draw this view. Try Low quality or reopen 3D.');
    }
    if(rendered){drawMeasurementLens();notifyView();}
  }
  const onContextLost=event=>{cancelDemoPointer();finishDemoFace(new DOMException('The graphics context was interrupted.','AbortError'));event.preventDefault();contextLost=true;cancelAnimationFrame(frame);frame=0;qualitySelect.disabled=true;graphicsNotice('The graphics context was interrupted. The board and selection are retained while the browser recovers.',true);};
  const onContextRestored=()=>{if(!active)return;contextLost=false;qualitySelect.disabled=false;disposePipeline();environment?.dispose();environment=createEnvironment();scene.environment=environment?.texture||null;renderer.shadowMap.needsUpdate=true;quality='balanced';presentation.apply(false);qualitySelect.value=quality;host.dataset.quality=quality;graphicsNotice('Graphics restored. Balanced rendering is active; High quality can be selected again.');sizeViewport();invalidate();};
  renderer.domElement.addEventListener('webglcontextlost',onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored',onContextRestored);
  const onDocumentVisibility=()=>{if(document.hidden){cancelDemoPointer();cancelAnimationFrame(frame);frame=0;}else invalidate();};
  document.addEventListener('visibilitychange',onDocumentVisibility);
  const closeVisibility=event=>{const path=event.composedPath();if(!path.includes(displayButton)&&!path.includes(visibilityOptions))setDisplayOpen(false);};
  const escapeVisibility=event=>{if(event.key==='Escape'&&!visibilityOptions.hidden){setDisplayOpen(false,true);event.preventDefault();event.stopImmediatePropagation();}};
  document.addEventListener('pointerdown',closeVisibility);shadow.addEventListener('keydown',escapeVisibility,true);
  resources.retain(scene);
  applyAppearance(initialAppearance);
  applyQuality(initialQuality,false);
  void loadRepositoryModels();
  return { host, board,
    pickDemoFace,
    createDemoSurface(id,input){if(!active)throw new Error('The 3D view is closed.');return demoSurfaces.createSurface(id,input);},
    setDemoInputHandler(handler){if(handler===null)cancelDemoPointer();demoSurfaces.setInputHandler(handler);},
    objectVisibilityCapabilities(){return {supportedTypes:[...objectVisibility.supportedTypes],unsupportedTypes:['graphics','texts','regions','dimensions','rooms','footprints']};},
    setObjectVisibility(input={}) {
      const next=objectVisibilityPolicy(input||{});
      if(next.side!==objectVisibility.side||JSON.stringify(next.hiddenTypes)!==JSON.stringify(objectVisibility.hiddenTypes))userAdjustedCamera=true;
      objectVisibility=next;
      for(const {mesh,type,layer}of visibilityRecords)mesh.visible=objectVisibility.visible(type,layer);
      updateComponentVisibility();
      setSelection(externalSelection);
      return {hiddenTypes:[...objectVisibility.hiddenTypes],side:objectVisibility.side,supportedTypes:[...objectVisibility.supportedTypes],unsupportedTypes:[...objectVisibility.unsupportedTypes]};
    },
    setMeasurementMode,clearMeasurements,
    measurementState(){return{mode:measuring,unit:measurementUnit,...measurementSession.snapshot()};},
    setQuality(value){return active?applyQuality(value):quality;},
    setAppearance(value){return active?applyAppearance(value):appearance;},
    getAppearance(){return appearance;},
    getCopperLayers(){return copperPlan.map(layer=>layer.name);},
    getVisibleCopperLayers(){return visibleCopperLayers();},
    setVisibleCopperLayers,
    getRenderStats(){const plan=qualityViewport(canvasHost.clientWidth,canvasHost.clientHeight,globalThis.devicePixelRatio,graphics.maxDimension,quality,graphics);return{...plan,...resources.stats(),appearance,modelUpdates:{...modelUpdates.stats(),cpuMilliseconds:modelUpdateCPUms},copperLayers:[...renderedCopperLayers],translucency:translucency.stats(),graphicsTier:graphics.tier,defaultQuality:graphics.defaultQuality,maxDimension:graphics.maxDimension,antialias:gl.getContextAttributes()?.antialias===true,logarithmicDepth:renderer.capabilities.logarithmicDepthBuffer,floatTargets:graphics.premium||renderer.extensions.has('EXT_color_buffer_float'),presentationStage:presentation.enabled,environmentLighting:Boolean(scene.environment),ambientOcclusion:Boolean(pipeline),renderCount,contextLost,gpuTextures:renderer.info.memory.textures,drawCalls:renderer.info.render.calls,loadedModelCount:loadedModelIndexes.size,componentCount:board.components.length};},
    setAnalysisOverlay(surface) {
      if (!active) return { placed: false, reason: "3D viewer is closed." };
      if (!surface) { analysisOverlay?.dispose(); analysisOverlay = null; invalidate();return { placed: false, reason: "Overlay cleared." }; }
      const basis = surface.zBasis;
      const savedLayer = surface.layer;
      if ((surface.zKnown && !["front-depth", "board-center"].includes(basis)) || (!surface.zKnown && !["F.Cu", "B.Cu"].includes(savedLayer))) return { placed: false, reason: "Saved result elevation basis or board layer is unknown; use the standalone result scene." };
      const transform = ([x, y, z]) => [x - centerX, centerY - y, surface.zKnown ? (basis === "front-depth" ? thickness / 2 - z : z) : (savedLayer === "F.Cu" ? thickness / 2 : -thickness / 2)];
      const next = createResultOverlay(surface, transform);
      // Internal copper/thermal layers must remain inspectable on the opaque PCB.
      // The result UI identifies this as showing the selected field through the board.
      next.mesh.material.depthTest = false; next.mesh.renderOrder = 20;
      analysisOverlay?.dispose(); analysisOverlay = next; scene.add(next.group);
      invalidate();
      return { placed: true, basis: surface.zKnown ? basis : savedLayer, flat: !surface.zKnown };
    },
    setAnalysisProbes(probes) { analysisOverlay?.setProbes(probes);invalidate(); },
    setAnalysisOpacity(value) { analysisOverlay?.setOpacity(value);invalidate(); },
    setSelection,
    focusPart(uuid){
      if(!active||typeof uuid!=='string')return false;
      const indexes=board.components.flatMap((part,index)=>part.id===uuid?[index]:[]);
      if(indexes.length!==1)return false;
      const index=indexes[0];if(!population[index]||!componentMesh||!componentMatrices[index])return false;
      boardGroup.updateWorldMatrix(true,true);
      const model=modelGroups.get(index),bounds=new THREE.Box3();
      if(model?.children.length)bounds.setFromObject(model);
      else {
        const local=new THREE.Matrix4();componentMesh.getMatrixAt(index,local);if(local.determinant()===0)return false;
        if(!componentMesh.geometry.boundingBox)componentMesh.geometry.computeBoundingBox();
        bounds.copy(componentMesh.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(componentMesh.matrixWorld,local));
      }
      if(bounds.isEmpty())return false;
      sizeViewport();const state=partFocusCamera(bounds.min.toArray(),bounds.max.toArray(),board.components[index].layer,camera.fov,camera.aspect);if(!state)return false;
      camera.position.fromArray(state.position);controls.target.fromArray(state.target);camera.up.fromArray(state.up);
      const distance=camera.position.distanceTo(controls.target);controls.minDistance=Math.min(controls.minDistance,distance);controls.maxDistance=Math.max(controls.maxDistance,distance);
      userAdjustedCamera=true;controls.update();refreshClippingBounds();invalidate();return true;
    },
    clearSelection,
    projectAnchor,
    setAnchor(anchor){activeAnchor=anchor&&typeof anchor==='object'?anchor:null;anchorSignature='';if(activeAnchor)notifyAnchor();else options.onAnchor?.({anchor:null,point:null});},
    setSelectionDim(enabled){selectionDim=Boolean(enabled);setSelection(externalSelection);return selectionDim;},
    setSelectionStyle(value){const next=selectionStyle(value);if(selectionDim&&next.mode===selectionDisplayStyle.mode&&next.color===selectionDisplayStyle.color)return {...next};selectionDim=true;selectionDisplayStyle=next;setSelection(externalSelection);return {...next};},
    selectionAppearanceCapabilities(){return {dim:true,bright:true,isolate:true,sourceColors:true,instanceColors:true,desaturatesTextures:true};},
    setSelectionMode(mode){selectionMode=['all','part','net','pin'].includes(mode)?mode:'all';},
    fit(topView=false){if(active)fit(topView);},
    getCameraState(){return {position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray()};},
    setCameraState(input){if(!active)return false;const state=cameraState3D(input),damping=controls.enableDamping;controls.enableDamping=false;controls.update();camera.position.fromArray(state.position);controls.target.fromArray(state.target);camera.up.fromArray(state.up);const distance=camera.position.distanceTo(controls.target);controls.minDistance=Math.min(controls.minDistance,distance);controls.maxDistance=Math.max(controls.maxDistance,distance);controls.update();controls.enableDamping=damping;userAdjustedCamera=true;updateClipping();invalidate();return true;},
    setView(view){if(!active||!boardViewPresets.some(preset=>preset.id===view))return false;userAdjustedCamera=true;fit(view);return true;},
    zoom(factor){if(!active||!Number.isFinite(factor)||factor<=0)return;const offset=camera.position.clone().sub(controls.target);const distance=Math.max(controls.minDistance,Math.min(controls.maxDistance,offset.length()/factor));if(offset.length()>0)camera.position.copy(controls.target).add(offset.setLength(distance));controls.update();},
    setTheme(dark) {
      if (!active) return;
      host.dataset.theme = dark ? "dark" : "light";
      scene.background.setHex(dark ? 0x151820 : 0xe7ebf1);
      highlight.material.color.setHex(dark ? 0xffdf7d : 0x9b5500);
      groupHighlight.material.color.setHex(dark ? 0xffdf7d : 0x9b5500);
      resize();
      invalidate();
    },
    selectReference(reference) {
      const index = componentIndexes.get(reference);
      if (index == null || !componentMesh || !componentMatrices[index] || !active || !population[index]) return false;
      const model = modelGroups.get(index);
      if (model?.children.length) {
        const record = board.components[index];
        const [x, y] = world(record.at);
        select(record, new THREE.Vector3(x, y, record.layer?.startsWith("B.") ? bottom : top), model);
        return true;
      }
      const current = new THREE.Matrix4(); componentMesh.getMatrixAt(index, current);
      if (current.determinant() === 0) return false;
      const record = board.components[index];
      const [x, y] = world(record.at);
      const point = new THREE.Vector3(x, y, record.layer?.startsWith("B.") ? bottom - 1.1 : top + 1.1);
      componentMesh.localToWorld(point);
      select(record, point, componentMesh, index);
      return true;
    },
    setPopulation(entries) {
      if (!componentMesh || !active) return;
      population = populationMask(board.components, entries);
      updateComponentVisibility();
      setSelection(externalSelection);
      if (selected?.record?.ref) {
        const index = componentIndexes.get(selected.record.ref);
        if (index != null && !population[index]) clearSelection();
      }
    },
    dispose() { silkDetail.dispose();cancelDemoPointer();finishDemoFace(new DOMException('The 3D view was closed.','AbortError'));demoSurfaces.dispose();for(const [name,handler]of [['pointerdown',demoPointerDown],['pointermove',demoPointerMove],['pointerup',demoPointerUp],['pointercancel',demoPointerCancel],['lostpointercapture',demoPointerCancel]])renderer.domElement.removeEventListener(name,handler,true);shadow.removeEventListener('keydown',demoKey,true);document.defaultView?.removeEventListener('blur',cancelDemoPointer);if(measuring)options.onMeasurementMode?.(false);active = false; modelUpdates.dispose(); analysisOverlay?.dispose(); stepClient?.dispose(); cancelAnimationFrame(frame); cancelAnimationFrame(layoutFrame); observer.disconnect();controls.removeEventListener('change',invalidate); controls.removeEventListener("change", updateClipping); controls.removeEventListener("start", cameraInteraction); controls.dispose();disposePipeline();environment?.dispose();renderer.domElement.removeEventListener('webglcontextlost',onContextLost);renderer.domElement.removeEventListener('webglcontextrestored',onContextRestored);document.removeEventListener('pointerdown',closeVisibility);shadow.removeEventListener('keydown',escapeVisibility,true);shadow.removeEventListener('keydown',escapeMeasurement);
    renderer.domElement.removeEventListener('pointerdown',measurementTouchCapture,true);document.removeEventListener('visibilitychange',onDocumentVisibility);selectionAppearance.dispose();translucency.dispose();scene.traverse(object=>object.shadow?.dispose?.());resources.retain(scene);terminalLabelCache.forEach(texture=>resources.track(texture));resources.track(labelGeometry);resources.dispose();scene.clear();boardGroup.clear();parts.clear();silkGroup.clear();copperGroups.clear();pickables.length=0;visibilityRecords.length=0;appearanceRecords.length=0;componentMatrices.length=0;modelGroups.clear();terminalLabelCache.clear();hold.dispose(); renderer.dispose();renderer.domElement.width=1;renderer.domElement.height=1; host.remove(); } };
}
