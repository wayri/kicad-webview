# Scripted 3D presentations

DemoController adds caller-scripted LEDs, display surfaces, buttons, knobs and scoped keys to an already loaded 3D KiCadViewer. These are virtual presentation controls. They never edit the KiCad source, run a circuit simulation, or connect to hardware. Host functions are ordinary JavaScript supplied by the page; source files, URLs and view links cannot inject executable demo code.

~~~js
import { Viewer, DemoController } from '@wayrisignals/kicad-webview';
const viewer = new Viewer('#board', {theme:'dark'});
await viewer.load('/designs/project.json', {view:'3d'});
const demo = new DemoController(viewer);

// Use a real, unambiguous saved identity. References must resolve uniquely.
demo.addLED('status', {anchor:{reference:'D1'}, color:'#65ff84'});
demo.setLED('status', {on:true, brightness:.7});

const selectedFace = await viewer.pickDemoFace(); // user selects actual mounted geometry
demo.addDisplay('screen', {face:selectedFace, mode:'oled', width:128, height:64});
demo.drawDisplay('screen', (ctx, canvas) => {
  ctx.fillStyle = '#001014'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#65ffcc'; ctx.font = '12px monospace';
  ctx.fillText('READY', 8, 20);
});

demo.addButton('start', {anchor:{reference:'SW1',face:'top'},
  onPress: () => demo.setLED('status', true),
  onRelease: event => { if (!event.cancelled) demo.setLED('status', false); }
});
demo.addKnob('level', {anchor:{reference:'RV1',face:'top'}, min:0, max:100, step:1, value:25,
  onChange: event => console.log('Demo value', event.value)
});
demo.bindKey('Space', {id:'start', action:'press'});
demo.bindKey('ArrowUp', {id:'level', action:'increment', repeat:true});
demo.bindKey('ArrowDown', {id:'level', action:'decrement', repeat:true});
// An explicit page button can call demo.focus(); construction never autofocuses.
// Cleanup: demo.dispose(); viewer.dispose();
~~~

All APIs are also available through the self-hosted classic script (KiCadWebView.DemoController); no framework, Node runtime, service session or extra dependency is required in the hosting page. The npm beta remains pending publication.

## Bind actual geometry

Each add method takes a unique control ID (1–128 characters) and a saved anchor or an explicit face token. An anchor contains uuid and/or reference, and optional named face top, bottom, front, back, left or right. The 3D adapter resolves the actual saved component identity and selected geometry; missing or ambiguous targets fail. A selected face token belongs to one mounted scene and is not a durable reference or a promise that the source component is physically a display. A virtual OLED painted on a driver stand-in remains an explicitly virtual demonstration.

Display surfaces require an actual supported face. A curved LED body may use a whole-component visual overlay rather than a guessed flat lens. getFace(id) returns a copied frame with center, normal, width, height and optional up/right/shape. Whole-component frames retain shape:'component' and normal:null; callers must not infer a physical planar display or lens from that result. Planar frames use shape:'face' and a real normal. Host scripts can frame a selected face with the public 3D camera API.

One active controller owns a viewer's demo input handler. The controller binds to exact saved source text, file path and renderer identity. Changing the source, view or renderer suspends it, releases held controls, removes key listeners/bindings and disposes its surfaces. It never automatically reattaches a stale face to new geometry. Recreate the controller and bind the new scene explicitly. Viewer disposal also disposes the controller; dispose() is idempotent and never disposes the supplied viewer. Failed replacement loads that preserve the current source/renderer do not invalidate the demo.

## Graphics and control methods

addLED, addDisplay, addButton and addKnob return their ID. getState(id) returns copied state without materials, callbacks or source geometry. remove(id) releases a pressed control, removes its key bindings, disposes its surface and releases its pixel budget. Colors use #rrggbb. LED brightness is 0–1; setLED accepts a boolean or a patch with on, brightness and color. Surface visuals are presentation effects, not photometric LED models.

Displays accept mode matrix, oled, lcd or tft. Defaults are 16×8, 128×64, 320×240 and 320×240 pixels, respectively. TFT accepts full-color RGBA pixel buffers, native canvas graphics and images through the same APIs; it does not quantize graphics to monochrome. Width and height are integers from 1 to 1024; all displays together are limited to 4,194,304 pixels, and a controller has at most 64 controls. drawDisplay(id, (context, canvas) => {}) accepts a synchronous native 2D canvas function and updates the texture only after it completes. A thrown or asynchronous draw callback reports an error and returns false; it is not retried. Canvas painting is not transactional. An origin-clean/GPU upload failure reports one upload-phase error and returns false without escaping the drawing method. writeImage(id, image) clears and scales a native CanvasImageSource to the display. Images must obey the browser's origin-clean/CORS rules for WebGL canvas textures; the library does not fetch remote images on your behalf.

setPixels(id, bytes, options) accepts Uint8Array or Uint8ClampedArray, respects view byte offsets, and checks the exact byte length before drawing:

| format | Bytes and ordering |
| --- | --- |
| rgba | width × height × 4; row-major red, green, blue, alpha bytes. |
| mono | width × height; each nonzero byte is an on pixel. |
| mono1 | ceil(width / 8) × height; row-major, MSB first, each row padded to a byte boundary. |

Without an explicit format, a full RGBA-length array selects rgba; otherwise mono is used. Monochrome foreground/background options accept #rrggbb; default foreground is green for matrix and pale cyan for OLED/LCD, with an opaque black background. The caller supplies graphics; the modes do not emulate a particular hardware display controller, electrical bus or character ROM.

Buttons use press(id) and release(id), onPress/onRelease callbacks, and press/release input events. Matching pointer and keyboard holds aggregate so one released input cannot prematurely release another. Lifecycle/focus/visibility cancellation releases held controls with cancelled:true. A host callback can inspect that flag before updating visuals on an old scene. Knobs use finite min/max, positive step and value; setKnob(id,value) clamps and quantizes, and change(id,delta) moves by delta × step. onChange receives the new value; setting the same value does not recurse. Knob pointer press/release phases are forwarded as input phases in addition to value changes.

input emits {id,type,value?,source,uv?,cancelled?}, with source script, pointer or keyboard. Display touches preserve the renderer's normalized surface UV coordinates, allowing host scripts to implement graphics touch regions. The host chooses its UV-to-pixel convention. Native originalEvent may be present for pointer/key input. error emits {id?,phase,error}; synchronous and asynchronous host callback failures are caught once per invocation, and late rejected callbacks are consumed without reaching a replaced scene. suspend emits {reason}. Neither callbacks nor state are serialized into shareable view URLs.

## Scoped keyboard controls

bindKey uses KeyboardEvent.code (for example Space, KeyL or ArrowUp) and returns an unbind function. The id/action form supports press for buttons/displays, toggle for LEDs/buttons/displays, and increment/decrement for knobs. The callback form accepts onDown and/or onUp functions. repeat defaults to false; repeated knob changes can opt in. preventDefault defaults to true only after a binding actually matches. ctrlKey, metaKey, altKey and shiftKey flags must match exactly, with all false by default. There are at most 128 bindings.

Keys are listened for on the viewer root rather than on the document. Editable elements, links, toolbar buttons, sliders, comboboxes, contenteditable and IME composition are ignored, including elements inside nested shadow roots. The controller does not capture page-wide shortcuts. focus() explicitly focuses the owned viewer root with preventScroll; a canvas pointer press also gives the viewer keyboard focus. Constructor setup does not autofocus. An added tabindex is restored on disposal/suspension unless the host has changed it. Leaving viewer focus or hiding the page releases held controls.

## Full-color TFT

~~~js
const face = await viewer.pickDemoFace();
demo.addDisplay('tft', {face, mode:'tft', width:320, height:240});
demo.drawDisplay('tft', (ctx, canvas) => {
  ctx.fillStyle = '#081a35'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ff527d'; ctx.fillRect(16, 16, 80, 40);
  ctx.fillStyle = '#4ce4c1'; ctx.font = '20px sans-serif';
  ctx.fillText('Full color', 16, 90);
});
// Or: demo.setPixels('tft', rgbaBytes, {format:'rgba'});
~~~

The interactive example includes a 320×240 TFT dashboard with RGB color bars, multiple animated traces, a dial value and a touch marker. The selected geometry face sets the physical aspect ratio: graphics scale to fit that face. Canvas colors are sRGB and displayed without scene-light shading/tone mapping. This is a virtual graphics surface, not emulation of a TFT chip, SPI bus, RGB565 protocol or hardware backlight.
