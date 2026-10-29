import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const ar=fileURLToPath(new URL('../../docs/archive/f66-r77-2026-10-25/',import.meta.url));
const built=spawnSync(process.execPath,[path.join(ar,'build-browser-test.mjs')],{encoding:'utf8',env:process.env});
assert.equal(built.status,0,built.stderr);assert.equal(built.stderr,'');
const {chromium}=createRequire(process.env.R77_PLAYWRIGHT_PACKAGE||'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
let browser,output;
try{
 browser=await chromium.launch({executablePath:process.env.R77_CHROMIUM||'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',headless:true,chromiumSandbox:true,timeout:15000,args:['--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync']});
 const context=await browser.newContext({serviceWorkers:'block'}),blocked=[],errors=[];
 await context.route('**/*',async route=>{if(route.request().url().startsWith('file:'))await route.continue();else{blocked.push(route.request().url());await route.abort();}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(ar,'browser-react-test.html')).href,{waitUntil:'load'});
 await page.waitForFunction(()=>['passed','failed'].includes(document.getElementById('r77-result')?.dataset.status),{timeout:30000});
 output={...JSON.parse(await page.locator('#r77-result').textContent()),browser:browser.version(),blocked_requests:blocked,page_errors:errors};
 writeFileSync(path.join(ar,process.env.R77_ORIGINAL==='1'?'red-browser-result.json':'react-browser-result.json'),JSON.stringify(output,null,2)+'\n');
}finally{await browser?.close();}
for(const result of output.results)test(result.name,()=>assert.equal(result.passed,true,result.error));
test('file-only browser transport and no uncaught page errors',()=>{assert.deepEqual(output.blocked_requests,[]);assert.deepEqual(output.page_errors,[]);assert.deepEqual(output.unhandled,[]);});
