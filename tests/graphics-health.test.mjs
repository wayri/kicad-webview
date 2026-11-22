/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGraphicsHealth} from '../engine/spike/graphicsHealth.mjs';

test('steady rendering does not synchronize GPU error state every frame',()=>{
 let calls=0,error=0;const health=createGraphicsHealth({NO_ERROR:0,getError(){calls++;return error;}});
 for(let frame=0;frame<10000;frame++)assert.equal(health.check(),true);
 assert.equal(calls,1);health.invalidate();assert.equal(health.check(),true);assert.equal(calls,2);
 error=1285;health.invalidate();assert.equal(health.check(),false,'new pipeline allocation failures remain detectable');assert.equal(calls,3);
 error=0;health.invalidate();assert.equal(health.check(),true,'context/pipeline recovery can be checked again');assert.equal(calls,4);
});
