// Search regression check: runs the REAL guides/assets/library.js against parent phrasings.
// Usage: node tools/qhg/search_tests/run.js en tools/qhg/search_tests/en.txt   (or: es ... es.txt)
const fs=require("fs"),vm=require("vm");
const lang=process.argv[2], R=require("path").resolve(__dirname,"../../..")+"/";
const lib=fs.readFileSync(process.argv[4]||R+"guides/assets/library.js","utf8");
const idx=JSON.parse(fs.readFileSync(R+"guides/assets/"+(lang==="es"?"index-es.json":"index.json"),"utf8"));
const q={value:"",addEventListener(e,f){ctx.__run=f;}}, r={innerHTML:""};
const doc={getElementById:id=>id==="q"?q:id==="results"?r:null,querySelectorAll:()=>[],querySelector:()=>null,body:{classList:{toggle(){}}},cookie:"",documentElement:{lang},addEventListener(){}};
let ready; const p=new Promise(res=>ready=res);
const ctx={document:doc,window:{},location:{hash:"",pathname:lang==="es"?"/guides/es/":"/guides/",origin:"x"},history:{replaceState(){}},navigator:{},setTimeout:(f)=>f(),clearTimeout(){},console,
 fetch:()=>Promise.resolve({json:()=>Promise.resolve(idx)})};
ctx.window=ctx; vm.createContext(ctx);
try{vm.runInContext(lib,ctx);}catch(e){}
setTimeout(()=>{ // let fetch resolve
 const lines=fs.readFileSync(process.argv[3],"utf8").split("\n").filter(l=>l.trim()&&!l.startsWith("#"));
 for(const l of lines){const [qq,want]=l.split("=>").map(s=>s.trim());q.value=qq;vm.runInContext("void 0",ctx);
  ctx.__q=qq; // trigger run via exposed hash path: simplest is to call input listener; instead re-run by evaluating
  r.innerHTML="";ctx.__run&&ctx.__run();
  const got=[...r.innerHTML.matchAll(/href="[^"]*\/([a-z0-9-]+)\/"/g)].map(m=>m[1]);
  const crisis=r.innerHTML.includes("crisis-box");
  const ok=want?(want==="none"?got.length===0:want==="crisis"?crisis:want.split("|").includes(got[0])):null;
  console.log((ok===null?"   ":ok?"OK ":"BAD")+" | "+qq+" | "+(crisis?"[CRISIS] ":"")+got.slice(0,3).join(", ")+(want?"   (want "+want+")":""));}
},50);
