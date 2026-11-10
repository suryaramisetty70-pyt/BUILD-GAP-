import {build} from 'esbuild';
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
await mkdir('dist/public',{recursive:true});
await build({entryPoints:['src/main.tsx'],bundle:true,minify:true,format:'esm',target:'es2022',jsx:'automatic',outdir:'dist/public',entryNames:'app',plugins:[{name:'vanilla-styles',setup(b){b.onLoad({filter:/globals\.css$/},async args=>({contents:(await readFile(args.path,'utf8')).replace(/^@import ['"]tailwindcss['"];?\s*$/m,''),loader:'css'}));}}]});
await copyFile('public/favicon.svg','dist/public/favicon.svg');
await writeFile('dist/public/index.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GapLab | Agent Behavior Research</title><meta name="description" content="Compare AI responses and improve prompts. No sign-in required."><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
console.log('Portable Node frontend built in dist/public.');
