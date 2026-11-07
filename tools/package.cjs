const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8').replace(/^\uFEFF/,''));
const files = new Set(['manifest.json','popup.html','popup.css','popup.js','icon.svg','lib/LICENSE-chess.js','LICENSE','NOTICE','docs/licenses/MIT-legacy.txt','PRIVACY.md']);
for(const file of manifest.content_scripts.flatMap(script=>[...(script.js||[]),...(script.css||[])])) files.add(file);
files.add(manifest.background.service_worker);
for(const file of Object.values(manifest.icons)) files.add(file);
const releaseRoot = path.join(root,'release');
const output = path.join(releaseRoot,`knightline-v${manifest.version}`);
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'INSTALL.md'), `# Knightline · Chess Lab ${manifest.version}\n\nExtract this folder, open chrome://extensions or edge://extensions, enable Developer mode, and choose Load unpacked. Select this folder, then open a supported board and enable Board analysis.\n\nSource and full documentation: https://github.com/sixfiguredev0/knightline-chess-lab\n\nLicence: see LICENSE and NOTICE. Privacy: see PRIVACY.md.\n`);
for(const file of files) {
 const target=path.resolve(output,file);
 if(!target.startsWith(output+path.sep)) throw new Error('Package path escaped release folder');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);
}
function crc32(buffer) {let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
const local=[],central=[];let offset=0;
files.add('INSTALL.md');
for(const file of [...files].sort()) {
 const name=Buffer.from(file.replace(/\\/g,'/')),data=fs.readFileSync(path.join(output,file)),crc=crc32(data);
 const head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt32LE(crc,14);head.writeUInt32LE(data.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(name.length,26);
 local.push(head,name,data);
 const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);central.push(entry,name);offset+=head.length+name.length+data.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const archive=path.join(releaseRoot,`Knightline-Chess-Lab-v${manifest.version}.zip`);fs.writeFileSync(archive,Buffer.concat([...local,directory,end]));
console.log(`Packaged ${files.size} runtime/documentation files.\nUnpacked: ${output}\nZIP: ${archive}`);
