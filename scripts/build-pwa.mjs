import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const assets=(await readdir('dist/assets')).map(f=>'assets/'+f);
const files=['index.html','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png',...assets];
const hash=createHash('sha256');for(const f of files)hash.update(await readFile('dist/'+f));
const sw=(await readFile('public/sw.js','utf8')).replace('__BUILD__',hash.digest('hex').slice(0,16)).replace('const PRECACHE = [];','const PRECACHE = '+JSON.stringify(files)+';');
await writeFile('dist/sw.js',sw);console.log(`PWA: precached ${files.length} assets`);
