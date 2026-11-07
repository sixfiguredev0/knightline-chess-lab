const {test,before,after}=require('node:test'), assert=require('node:assert/strict'), http=require('node:http');
const {createServer}=require('../tools/demo-server.cjs');let server,port;
before(async()=>{server=await createServer(0);port=server.address().port;});
after(()=>{server.closeAllConnections();server.close();});
function request(path,headers={},method='GET') {return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{Host:`127.0.0.1:${port}`,...headers}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));});req.on('error',reject);req.end();});}
test('demo binds only to loopback and serves the intended page and SVG',async()=>{
 assert.equal(server.address().address,'127.0.0.1');
 assert.equal((await request('/analysis')).status,200);
 assert.equal((await request('/icon.svg')).headers['content-type'],'image/svg+xml');
});
test('demo blocks Git, environment, backups, reports and arbitrary source files',async()=>{
 for(const file of ['/.git/config','/.publish/.git/config','/.env','/.backup-v4.7/app.js','/artifacts/live-smoke.json','/README.md','/package.json','/tools/package.cjs','/%2e%2e/.env']) {
  const response=await request(file);assert.notEqual(response.status,200,file);
 }
});
test('demo rejects malformed paths, writes and unexpected host/origin headers',async()=>{
 assert.equal((await request('/%zz')).status,400);
 assert.equal((await request('/analysis',{},'POST')).status,405);
 assert.equal((await request('/analysis',{Host:'attacker.example'})).status,403);
 assert.equal((await request('/analysis',{Origin:'https://attacker.example'})).status,403);
 assert.equal((await request('/analysis')).headers['x-content-type-options'],'nosniff');
});
