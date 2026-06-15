/* ============================================================
   N3 単語アプリ - ロジック / Logic
   - Firebase が設定されていればクラウド同期、未設定ならデモ(localStorage)
   ============================================================ */

/* ---------- 0. 状態 ---------- */
let DEMO = false;             // デモモード(Firebase未設定)
let auth=null, db=null;
let user=null;                // {uid,email,name,admin}
let prog=null;                // 進捗 {words:{idx:{s,w,c}}, days:{'YYYY-MM-DD':n}, streak, last}
let authMode='login';
const TODAY = ()=> new Date().toISOString().slice(0,10);
const $ = id=>document.getElementById(id);

/* words[i] = [日本語, 読み, ベトナム語]  (vocab.js の VOCAB) */
const WORDS = (typeof VOCAB!=='undefined') ? VOCAB : [];

/* ---------- 1. 初期化 ---------- */
function initFirebase(){
  const ok = FIREBASE_CONFIG && !String(FIREBASE_CONFIG.apiKey).startsWith("ここに");
  if(!ok){ DEMO=true; return; }
  firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();
  auth.onAuthStateChanged(async u=>{
    if(u){
      const snap = await db.collection('users').doc(u.uid).get();
      const data = snap.exists ? snap.data() : {};
      user = { uid:u.uid, email:u.email, name:data.name||u.email.split('@')[0],
               admin: ADMIN_EMAILS.includes((u.email||'').toLowerCase()) };
      prog = normalizeProg(data.progress);
      enterApp();
    }else{ showLogin(); }
  });
}

function normalizeProg(p){
  p = p||{};
  return { words:p.words||{}, days:p.days||{}, streak:p.streak||0, last:p.last||'' };
}

/* ---------- 2. 認証 ---------- */
function setAuthMode(m){
  authMode=m;
  $('segLogin').classList.toggle('on',m==='login');
  $('segReg').classList.toggle('on',m==='reg');
  $('regName').classList.toggle('hidden',m!=='reg');
  $('authBtn').textContent = m==='login'?'Đăng nhập':'Đăng ký';
  $('authErr').textContent='';
}

async function doAuth(){
  const email=$('iEmail').value.trim(), pass=$('iPass').value, name=$('iName').value.trim();
  $('authErr').textContent='';
  if(!email||!pass){ $('authErr').textContent='Vui lòng nhập email và mật khẩu.'; return; }

  if(DEMO){ return demoAuth(email,pass,name); }

  try{
    if(authMode==='reg'){
      const cred = await auth.createUserWithEmailAndPassword(email,pass);
      await db.collection('users').doc(cred.user.uid).set({
        name: name||email.split('@')[0], email, createdAt: Date.now(),
        progress: normalizeProg(null)
      });
    }else{
      await auth.signInWithEmailAndPassword(email,pass);
    }
  }catch(e){ $('authErr').textContent = friendlyErr(e.code||e.message); }
}

function friendlyErr(c){
  const m={
    'auth/invalid-email':'Email không hợp lệ.',
    'auth/user-not-found':'Tài khoản không tồn tại.',
    'auth/wrong-password':'Sai mật khẩu.',
    'auth/invalid-credential':'Email hoặc mật khẩu sai.',
    'auth/email-already-in-use':'Email đã được đăng ký.',
    'auth/weak-password':'Mật khẩu cần ít nhất 6 ký tự.'
  };
  return m[c]||('Lỗi: '+c);
}

function logout(){
  if(DEMO){ user=null; prog=null; showLogin(); return; }
  auth.signOut();
}

/* ---------- 2b. デモモード (Firebase無し / localStorage) ---------- */
function demoAuth(email,pass,name){
  const key='demo_'+email;
  let rec=JSON.parse(localStorage.getItem(key)||'null');
  if(authMode==='reg'){
    if(rec){ $('authErr').textContent='Email đã tồn tại (demo).'; return; }
    rec={ name:name||email.split('@')[0], email, pass, progress:normalizeProg(null) };
    localStorage.setItem(key,JSON.stringify(rec));
    registerDemoUser(email);
  }else{
    if(!rec||rec.pass!==pass){ $('authErr').textContent='Sai email hoặc mật khẩu (demo).'; return; }
  }
  user={ uid:email, email, name:rec.name, admin: ADMIN_EMAILS.includes(email.toLowerCase()) };
  prog=normalizeProg(rec.progress);
  enterApp();
}
function registerDemoUser(email){
  let arr=JSON.parse(localStorage.getItem('demo_users')||'[]');
  if(!arr.includes(email)){ arr.push(email); localStorage.setItem('demo_users',JSON.stringify(arr)); }
}
function saveDemo(){
  const key='demo_'+user.email;
  let rec=JSON.parse(localStorage.getItem(key)||'{}');
  rec.progress=prog; rec.name=user.name; rec.email=user.email;
  localStorage.setItem(key,JSON.stringify(rec));
}

/* ---------- 3. 進捗保存 ---------- */
let saveTimer=null;
function saveProg(){
  if(DEMO){ saveDemo(); return; }
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    db.collection('users').doc(user.uid).set({progress:prog},{merge:true}).catch(()=>{});
  },600);
}

function markStudied(){
  const t=TODAY();
  prog.days[t]=(prog.days[t]||0)+1;
  // streak 計算
  if(prog.last!==t){
    const y=new Date(Date.now()-86400000).toISOString().slice(0,10);
    prog.streak = (prog.last===y)? prog.streak+1 : 1;
    prog.last=t;
  }
}

/* word 状態: s=studied(1), w=weak count, c=correct streak。mastered = c>=3 */
function setWord(idx,known){
  const w = prog.words[idx] || {s:0,w:0,c:0};
  w.s=1;
  if(known){ w.c=(w.c||0)+1; }
  else{ w.w=(w.w||0)+1; w.c=0; }
  prog.words[idx]=w;
  markStudied();
  saveProg();
}

function stats(){
  let learned=0,mastered=0,weak=0;
  for(const k in prog.words){
    const w=prog.words[k];
    if(w.s) learned++;
    if((w.c||0)>=3) mastered++;
    if((w.w||0)>0 && (w.c||0)<3) weak++;
  }
  return {learned,mastered,weak,total:WORDS.length};
}

/* ---------- 4. 画面遷移 ---------- */
function showLogin(){ $('login').classList.remove('hidden'); $('app').classList.add('hidden'); }
function enterApp(){
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  $('who').textContent = (user.admin?'👑 ':'')+user.name;
  buildTabs();
  showTab('Home');
}

const TABS=[
  ['Home','Trang chủ'],['Flash','Thẻ từ'],['Quiz','Trắc nghiệm'],['List','Danh sách']
];
function buildTabs(){
  const tabs = user.admin ? [...TABS,['Admin','Quản trị']] : TABS;
  $('tabbar').innerHTML = tabs.map(([k,l])=>
    `<button class="tab" id="tab${k}" onclick="showTab('${k}')">${l}</button>`).join('');
}
function showTab(k){
  ['Home','Flash','Quiz','List','Admin'].forEach(x=>{
    const v=$('v'+x), t=$('tab'+x);
    if(v) v.classList.toggle('hidden',x!==k);
    if(t) t.classList.toggle('active',x===k);
  });
  if(k==='Home') renderHome();
  if(k==='Flash') startFlash(flash.mode||'all');
  if(k==='Quiz') startQuiz();
  if(k==='List') renderList();
  if(k==='Admin') loadAdmin();
}

/* ---------- 5. Home / 進捗 ---------- */
function renderHome(){
  const s=stats();
  $('hello').textContent='Xin chào, '+user.name+' 👋';
  $('streakLine').textContent='Chuỗi học liên tiếp: '+prog.streak+' ngày 🔥';
  $('sLearned').textContent=s.learned;
  $('sMastered').textContent=s.mastered;
  $('sWeak').textContent=s.weak;
  $('sStreak').textContent=prog.streak;
  const pct = s.total? Math.round(s.learned/s.total*100):0;
  $('pctTxt').textContent=pct+'%';
  $('pctBar').style.width=pct+'%';
  $('learnedN').textContent=s.learned; $('totalN').textContent=s.total;
  renderCal();
}
function renderCal(){
  let html='';
  for(let i=29;i>=0;i--){
    const d=new Date(Date.now()-i*86400000).toISOString().slice(0,10);
    const n=prog.days[d]||0;
    let cls=''; if(n>0&&n<10)cls='l1'; else if(n<25&&n>0)cls='l2'; else if(n>=25)cls='l3';
    html+=`<div class="d ${cls}" title="${d}: ${n}">${parseInt(d.slice(8))}</div>`;
  }
  $('cal').innerHTML=html;
}

/* ---------- 6. フラッシュカード ---------- */
let flash={ list:[], i:0, flipped:false, mode:'all' };
function startFlash(mode){
  flash.mode=mode;
  $('fModeAll').classList.toggle('on',mode==='all');
  $('fModeWeak').classList.toggle('on',mode==='weak');
  let idxs=[];
  if(mode==='weak'){
    idxs = Object.keys(prog.words).filter(k=>{
      const w=prog.words[k]; return (w.w||0)>0 && (w.c||0)<3;
    }).map(Number);
    if(idxs.length===0){ toast('Chưa có từ yếu nào. Hãy làm trắc nghiệm trước! 🎉'); }
  }else{
    idxs = WORDS.map((_,i)=>i);
  }
  shuffle(idxs);
  flash.list=idxs; flash.i=0; flash.flipped=false;
  showFlash();
}
function showFlash(){
  if(flash.list.length===0){ $('fJp').textContent='—'; $('fCount').textContent='0 / 0'; return; }
  const idx=flash.list[flash.i];
  const w=WORDS[idx];
  flash.flipped=false;
  $('fJp').textContent=w[0];
  $('fReading').textContent=w[1];
  $('fVn').textContent=w[2];
  $('fBack').classList.add('hidden');
  $('fHint').classList.remove('hidden');
  $('fCount').textContent=(flash.i+1)+' / '+flash.list.length;
  $('fBar').style.width=((flash.i)/flash.list.length*100)+'%';
}
function flipCard(){
  flash.flipped=!flash.flipped;
  $('fBack').classList.toggle('hidden',!flash.flipped);
  $('fHint').classList.toggle('hidden',flash.flipped);
  if(flash.flipped) speakCurrent();
}
function gradeCard(known){
  if(flash.list.length===0) return;
  const idx=flash.list[flash.i];
  setWord(idx,known);
  flash.i++;
  if(flash.i>=flash.list.length){
    toast('Hoàn thành! / 完了 🎉'); $('fBar').style.width='100%';
    flash.i=0; shuffle(flash.list);
    if(flash.mode==='weak') startFlash('weak');
  }
  showFlash();
}
function speakCurrent(){
  if(flash.list.length===0) return;
  speakText(WORDS[flash.list[flash.i]][0]);
}

/* ---------- 7. クイズ ---------- */
let quiz={ pool:[], i:0, score:0, total:0, dir:'jv', cur:null, answered:false };
function setQuizDir(d){
  quiz.dir=d;
  $('qDirJV').classList.toggle('on',d==='jv');
  $('qDirVJ').classList.toggle('on',d==='vj');
  startQuiz();
}
function startQuiz(){
  // 苦手を優先しつつ全体から出題
  let weak = Object.keys(prog.words).filter(k=>{const w=prog.words[k];return (w.w||0)>0&&(w.c||0)<3;}).map(Number);
  let all = WORDS.map((_,i)=>i);
  shuffle(all); shuffle(weak);
  quiz.pool = [...weak, ...all].filter((v,i,a)=>a.indexOf(v)===i).slice(0,20);
  quiz.i=0; quiz.score=0; quiz.total=quiz.pool.length;
  $('qScore').textContent='Đúng: 0';
  showQuiz();
}
function showQuiz(){
  if(quiz.i>=quiz.pool.length){
    $('qBox').innerHTML='<div class="center" style="padding:24px"><div class="jp" style="font-size:30px">🎉</div>'+
      '<h3>Hoàn thành 20 câu!</h3><div class="muted">Đúng '+quiz.score+'/'+quiz.total+'</div></div>';
    $('qNext').textContent='Làm lại';
    $('qNext').onclick=()=>{ $('qNext').onclick=nextQuiz; startQuiz(); };
    return;
  }
  // 復元 qBox in case of completion screen
  if(!$('qPrompt')){
    $('qBox').innerHTML='<div class="center" style="padding:10px 0"><div class="jp" id="qPrompt" style="font-size:34px">—</div>'+
      '<button class="speak" id="qSpeak" style="margin-top:10px">🔊</button></div><div id="qOpts" style="margin-top:14px"></div>';
  }
  quiz.answered=false;
  $('qNext').textContent='Câu tiếp →'; $('qNext').onclick=nextQuiz;
  const idx=quiz.pool[quiz.i];
  const w=WORDS[idx]; quiz.cur=w;
  const jv = quiz.dir==='jv'; // 日→越
  $('qPrompt').textContent = jv ? w[0] : w[2];
  $('qPrompt').style.fontSize = jv ? '34px':'24px';
  $('qSpeak').style.display = jv ? 'inline-flex':'none';
  $('qSpeak').onclick=()=>speakText(w[0]);
  if(jv) speakText(w[0]);
  // 選択肢
  let opts=[idx]; let guard=0;
  while(opts.length<4 && guard++<200){
    const r=Math.floor(Math.random()*WORDS.length);
    if(!opts.includes(r) && WORDS[r][2]!==w[2] && WORDS[r][0]!==w[0]) opts.push(r);
  }
  shuffle(opts);
  $('qOpts').innerHTML = opts.map(o=>{
    const label = jv ? WORDS[o][2] : (WORDS[o][0]+' ('+WORDS[o][1]+')');
    return `<button class="opt" data-o="${o}" onclick="answerQuiz(${o},${idx},this)">${label}</button>`;
  }).join('');
  $('qCount').textContent='Câu '+(quiz.i+1)+' / '+quiz.total;
  $('qNext').classList.add('hidden');
}
function answerQuiz(chosen,correct,el){
  if(quiz.answered) return;
  quiz.answered=true;
  const right = chosen===correct;
  setWord(correct,right);
  document.querySelectorAll('#qOpts .opt').forEach(b=>b.disabled=true);
  el.classList.add(right?'correct':'wrong');
  if(!right){
    // 正解をハイライト
    document.querySelectorAll('#qOpts .opt').forEach(b=>{
      if(Number(b.getAttribute('data-o'))===correct) b.classList.add('correct');
    });
  }
  if(right){ quiz.score++; $('qScore').textContent='Đúng: '+quiz.score; }
  $('qNext').classList.remove('hidden');
}
function nextQuiz(){ quiz.i++; showQuiz(); }

/* ---------- 8. 一覧 ---------- */
function renderList(){
  const q=($('search').value||'').toLowerCase().trim();
  const f=$('filter').value;
  const body=$('listBody');
  let rows='', cnt=0;
  for(let i=0;i<WORDS.length;i++){
    const w=WORDS[i], st=prog.words[i]||{};
    const mastered=(st.c||0)>=3, weak=(st.w||0)>0&&!mastered, learned=!!st.s;
    if(f==='learned'&&!learned)continue;
    if(f==='mastered'&&!mastered)continue;
    if(f==='weak'&&!weak)continue;
    if(f==='new'&&learned)continue;
    if(q && !(w[0].toLowerCase().includes(q)||w[1].toLowerCase().includes(q)||w[2].toLowerCase().includes(q)))continue;
    cnt++;
    if(cnt>400){ continue; } // 描画上限
    let badge = mastered?'<span class="pill" style="background:#dcfce7;color:#166534">習得</span>'
      : weak?'<span class="pill" style="background:#fee2e2;color:#991b1b">苦手</span>'
      : learned?'<span class="pill">学習中</span>':'';
    rows+=`<tr><td><b>${w[0]}</b></td><td class="muted">${w[1]}</td><td>${w[2]}</td>
      <td>${badge} <button class="btn ghost sm" onclick="speakText('${w[0].replace(/'/g,"")}')">🔊</button></td></tr>`;
  }
  body.innerHTML=rows||'<tr><td colspan="4" class="muted center" style="padding:20px">Không có kết quả</td></tr>';
  $('listCount').textContent='Hiển thị '+Math.min(cnt,400)+' / '+cnt+' từ'+(cnt>400?' (giới hạn 400, hãy tìm kiếm để thu hẹp)':'');
}

/* ---------- 9. 管理ダッシュボード ---------- */
async function loadAdmin(){
  let users=[];
  if(DEMO){
    const emails=JSON.parse(localStorage.getItem('demo_users')||'[]');
    users=emails.map(e=>{ const r=JSON.parse(localStorage.getItem('demo_'+e)||'{}');
      return {name:r.name||e,email:e,progress:normalizeProg(r.progress)}; });
  }else{
    try{
      const snap=await db.collection('users').get();
      snap.forEach(d=>{ const v=d.data(); users.push({name:v.name||v.email,email:v.email,progress:normalizeProg(v.progress)}); });
    }catch(e){ $('adminHint').textContent='Không đọc được dữ liệu: '+e.message; }
  }
  const t=TODAY();
  let totLearned=0, active=0, rows='';
  users.sort((a,b)=>statsOf(b).learned-statsOf(a).learned);
  for(const u of users){
    const s=statsOf(u);
    totLearned+=s.learned;
    if(u.progress.last===t) active++;
    rows+=`<tr><td><b>${esc(u.name)}</b></td><td class="muted">${esc(u.email)}</td>
      <td>${s.learned}</td><td>${s.mastered}</td><td>${s.weak}</td>
      <td>${u.progress.streak||0}🔥</td><td class="muted">${u.progress.last||'-'}</td></tr>`;
  }
  $('aUsers').textContent=users.length;
  $('aActive').textContent=active;
  $('aAvg').textContent=users.length?Math.round(totLearned/users.length):0;
  $('adminBody').innerHTML=rows||'<tr><td colspan="7" class="muted center" style="padding:20px">Chưa có người học nào</td></tr>';
  $('adminHint').textContent='Tổng '+users.length+' người học • cập nhật '+new Date().toLocaleTimeString();
}
function statsOf(u){
  let learned=0,mastered=0,weak=0;
  const W=u.progress.words||{};
  for(const k in W){ const w=W[k]; if(w.s)learned++; if((w.c||0)>=3)mastered++;
    if((w.w||0)>0&&(w.c||0)<3)weak++; }
  return {learned,mastered,weak};
}

/* ---------- util ---------- */
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function esc(s){ return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }

/* 日本語 音声合成 / Web Speech API */
let jaVoice=null;
function pickVoice(){
  const vs=speechSynthesis.getVoices();
  jaVoice = vs.find(v=>v.lang==='ja-JP') || vs.find(v=>v.lang&&v.lang.startsWith('ja')) || null;
}
if('speechSynthesis' in window){
  pickVoice(); speechSynthesis.onvoiceschanged=pickVoice;
}
function speakText(txt){
  if(!txt || !('speechSynthesis' in window)) return;
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(txt);
    u.lang='ja-JP'; u.rate=0.9; if(jaVoice)u.voice=jaVoice;
    speechSynthesis.speak(u);
  }catch(e){}
}

/* ---------- start ---------- */
window.addEventListener('DOMContentLoaded',()=>{
  initFirebase();
  if(DEMO){ showLogin(); }
});
