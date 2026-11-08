/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {AdvancedKiCadViewer,parseViewLink} from '../src/index.mjs';
const project=new AdvancedKiCadViewer('#project',{theme:'dark',layout:'split'});
async function restore(){const state=parseViewLink(location.href);if(state)await project.restoreViewState(state);}
try{await project.load('./demo/project.json');await restore();}catch(error){project.setStatus(error.message,true);}
const changed=()=>restore().catch(error=>project.setStatus(error.message,true));window.addEventListener('hashchange',changed);
window.addEventListener('pagehide',()=>{window.removeEventListener('hashchange',changed);project.dispose();},{once:true});
