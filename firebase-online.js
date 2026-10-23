import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously, signOut, EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, getDocs, writeBatch, updateDoc } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAKM4bAwSkwT8Gqj0SmWI1vxBQ-6wU9d3I',
  authDomain: 'flappyadventure-abef4.firebaseapp.com',
  projectId: 'flappyadventure-abef4',
  storageBucket: 'flappyadventure-abef4.firebasestorage.app',
  messagingSenderId: '537426432976',
  appId: '1:537426432976:web:f36a1f5f5de980d2d39fd5'
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);
const LOCAL_KEY = 'flappy-adventure-progress-v1';
const defaults = () => ({coins:0,best:0,selected:'BIRD',unlocked:['BIRD']});
const skinIDs = new Set(['BIRD','CAT','FROG','BEE','ROCKET','DRAGON']);
const getLocal = () => { try { return {...defaults(),...JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}')}; } catch { return defaults(); } };
const emailFor = name => `${name.toLowerCase()}@players.flappyadventure.example.com`;
const normalize = raw => raw.trim().toLowerCase();
const allowed = name => /^[a-z0-9_]{3,20}$/.test(name);
let identity = null, registered = false, secure = false, remoteBest = 0;
let uploading = false, busy = false, switching = false;
function say(msg) { $('online-status').textContent = msg; }

function installUI() {
  const box = document.createElement('div');
  box.id='online-panel';
  box.style.cssText='width:100%;max-width:360px;margin:12px auto;display:grid;gap:9px';
  box.innerHTML = `
    <div id="online-status" role="status">Connecting to Firebase...</div>
    <form id="online-form" style="display:grid;gap:8px;background:#ebfaff;color:#173c59;padding:12px;border-radius:12px">
      <label for="online-name">USERNAME</label>
      <input id="online-name" autocomplete="username" maxlength="20" placeholder="3–20 English letters, numbers or _" required>
      <label for="online-password">PASSWORD (at least 6 characters)</label>
      <input id="online-password" type="password" autocomplete="current-password" minlength="6" required>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button type="submit" id="online-register" class="green">REGISTER</button>
        <button type="button" id="online-login" class="blue">LOGIN</button>
      </div>
    </form>
    <div id="online-current" hidden style="display:grid;gap:8px">
      <button id="online-protect" class="green" hidden>ADD PASSWORD TO THIS ACCOUNT</button>
      <button id="online-logout" class="gold" hidden>LOG OUT</button>
    </div>
    <button type="button" id="leaderboard-btn" class="purple">LEADERBOARD 🏆</button>`;
  $('menu').insertBefore(box, $('menu').querySelector('.footer'));
  for(const input of box.querySelectorAll('input')) input.style.cssText='width:100%;font-size:16px;padding:10px;border:1px solid #678;border-radius:7px';
  const leader = document.createElement('section'); leader.id='leaderboard'; leader.className='screen hidden';
  leader.innerHTML='<h2>LEADERBOARD 🏆</h2><p>Top 10 player records</p><div id="leaderboard-content" aria-live="polite" style="background:#ebfaff;color:#173c59;padding:20px;width:100%;border-radius:12px;text-align:left">Loading...</div><button id="leaderboard-back" class="gold back">BACK</button>';
  $('app').append(leader);
  $('online-form').addEventListener('submit', e => {e.preventDefault();void registerOrProtect();});
  $('online-login').addEventListener('click', () => void login());
  $('online-protect').addEventListener('click', () => { $('online-form').hidden=false; $('online-register').textContent='SAVE PASSWORD'; $('online-password').focus(); });
  $('online-logout').addEventListener('click', () => void logout());
  $('leaderboard-btn').addEventListener('click', () => void showLeaderboard());
  $('leaderboard-back').addEventListener('click', () => { $('leaderboard').classList.add('hidden'); $('menu').classList.remove('hidden'); });
  for(const id of ['play','shop-btn']) $(id).addEventListener('click',e=>{
    if(!registered || !secure){e.preventDefault();e.stopImmediatePropagation();say(!registered?'Register or log in first.':'Secure your account with a password first.');}
  },true);
}
function setUI() {
  $('online-form').hidden=registered;
  $('online-current').hidden=!registered;
  $('online-protect').hidden=!registered||secure;
  $('online-logout').hidden=!registered||!secure;
  $('online-register').textContent=registered?'SAVE PASSWORD':'REGISTER';
}
function copyProgress(remote) {
  const p={coins:Math.max(0,Number(remote.coins)||0),best:Math.max(0,Number(remote.highScore)||0),selected:skinIDs.has(remote.selectedSkin)?remote.selectedSkin:'BIRD',unlocked:Array.isArray(remote.unlockedSkins)?remote.unlockedSkins.filter(s=>skinIDs.has(s)):['BIRD']};
  if(!p.unlocked.includes('BIRD'))p.unlocked.push('BIRD');
  if(!p.unlocked.includes(p.selected))p.selected='BIRD';
  localStorage.setItem(LOCAL_KEY,JSON.stringify(p));
}
async function applyUser(user) {
  identity=user;
  const snap=await getDoc(doc(db,'users',user.uid));
  registered=snap.exists();secure=!user.isAnonymous;
  remoteBest=registered?Number(snap.data().highScore||0):0;
  if(registered){
    const label=snap.data().username||'Player';
    say(`PLAYER: ${label}${secure?'':' (needs password)'}`);
    // On a new signed-in identity, load only that identity's game progress.
    const owner=localStorage.getItem('flappy-last-owner');
    if(owner!==user.uid) {
      localStorage.setItem('flappy-last-owner',user.uid);
      copyProgress(snap.data());
      setUI();
      location.reload();
      return;
    }
    $('online-name').value=label;
  } else {
    say('Register a unique username, or LOGIN to an existing account.');
  }
  setUI();
}
async function registerOrProtect(){
  if(busy||!identity)return;
  const name=normalize($('online-name').value),raw=$('online-name').value.trim(),password=$('online-password').value;
  if(!allowed(name)){say('Username: 3–20 English letters, numbers or _.');return;}
  if(password.length<6){say('Choose a password with at least 6 characters.');return;}
  if(registered && $('online-name').value.toLowerCase()!==$('online-name').value.trim().toLowerCase()){} // keep original casing
  busy=true;
  try{
    if(registered){
      const snap=await getDoc(doc(db,'users',identity.uid));
      if(name!==snap.data().usernameLower){say('To secure your existing account, enter its original username.');return;}
    } else {
      // Reserve a unique name atomically. Firestore rules enforce both documents.
      const ownerRef=doc(db,'usernames',name),userRef=doc(db,'users',identity.uid);
      if((await getDoc(ownerRef)).exists()){say('Username already taken! Use LOGIN if it is yours.');return;}
      const batch=writeBatch(db);batch.set(ownerRef,{uid:identity.uid});
      batch.set(userRef,{username:raw,usernameLower:name,highScore:0,coins:0});
      await batch.commit();
      registered=true;
    }
    // Link the anonymous Firebase account to email/password without changing its UID.
    if(identity.isAnonymous){
      await linkWithCredential(identity,EmailAuthProvider.credential(emailFor(name),password));
    }
    secure=true;registered=true;
    localStorage.setItem('flappy-last-owner',identity.uid);
    if(!getLocal().unlocked) localStorage.setItem(LOCAL_KEY,JSON.stringify(defaults()));
    say(`PLAYER: ${raw} (secured)`);$('online-password').value='';setUI();
  }catch(e){ console.error(e);say(e.code==='auth/email-already-in-use'?'That username already has a login. Use LOGIN.':'Registration failed: '+(e.code||e.message)); }
  finally{busy=false;}
}
async function login(){
  if(busy)return;
  const name=normalize($('online-name').value),password=$('online-password').value;
  if(!allowed(name)||!password){say('Enter a valid username and password.');return;}
  busy=true;
  try{
    // Do not keep the anonymous account when switching to a different named account.
    switching=true;
    await signInWithEmailAndPassword(auth,emailFor(name),password);
    $('online-password').value='';
  }catch(e){switching=false;console.error(e);say('Could not log in. Check username and password.');}
  finally{busy=false;}
}
async function logout(){
  if(busy)return;busy=true;
  try{
    switching=true;
    await signOut(auth);
    localStorage.removeItem('flappy-last-owner');
    localStorage.setItem(LOCAL_KEY,JSON.stringify(defaults()));
    location.reload();
  }catch(e){say('Logout failed.');console.error(e);busy=false;switching=false;}
}
async function showLeaderboard(){
  $('menu').classList.add('hidden');$('leaderboard').classList.remove('hidden');$('leaderboard-content').textContent='Loading...';
  try{
    const rows=await getDocs(query(collection(db,'users'),orderBy('highScore','desc'),limit(10)));
    if(rows.empty){$('leaderboard-content').textContent='No scores yet!';return;}
    const ol=document.createElement('ol');
    rows.forEach(row=>{const li=document.createElement('li');li.textContent=`${row.data().username||'Player'} — ${row.data().highScore||0}`;li.style.padding='7px';ol.append(li);});
    $('leaderboard-content').replaceChildren(ol);
  }catch(e){console.error(e);$('leaderboard-content').textContent='Could not load leaderboard. Check Firestore rules.';}
}
async function syncProgress(){
  if(!registered||!secure||!identity||uploading)return;
  uploading=true;
  try{
    const p=getLocal();
    const score=Math.max(remoteBest,Math.floor(Number(p.best)||0));
    const coins=Math.max(0,Math.floor(Number(p.coins)||0));
    const unlocked=Array.isArray(p.unlocked)?p.unlocked.filter(s=>skinIDs.has(s)):['BIRD'];
    await updateDoc(doc(db,'users',identity.uid),{highScore:score,coins,selectedSkin:skinIDs.has(p.selected)?p.selected:'BIRD',unlockedSkins:unlocked});
    remoteBest=score;
  }catch(e){console.error('Could not sync game progress:',e);}
  finally{uploading=false;}
}
installUI();setUI();
const mutation=new MutationObserver(()=>{if(!$('overlay').classList.contains('hidden')&&$('overlay-title').textContent==='GAME OVER')void syncProgress();});
mutation.observe($('overlay'),{attributes:true,childList:true,subtree:true,characterData:true});
$('home').addEventListener('click',()=>void syncProgress());
$('shop-btn').addEventListener('click',()=>setTimeout(()=>{const grid=$('skin-grid');const obs=new MutationObserver(()=>void syncProgress());obs.observe(grid,{childList:true});},0));
onAuthStateChanged(auth,user=>{
  if(user){switching=false;applyUser(user).catch(e=>{console.error(e);say('Firebase error: check connection and rules.');});}
  else if(!switching)signInAnonymously(auth).catch(e=>{console.error(e);say('Anonymous sign-in failed. Enable it in Firebase.');});
});
