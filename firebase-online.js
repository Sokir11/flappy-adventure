import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
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
const status = msg => { $('online-status').textContent = msg; };
let uid = null, registered = false, remoteBest = 0, updating = false;

function installUI() {
  const menu = $('menu');
  const box = document.createElement('div');
  box.id = 'online-panel';
  box.innerHTML = `<div id="online-status" role="status">Connecting...</div>
    <form id="username-form" hidden><label for="username-input">CHOOSE YOUR USERNAME</label><br>
    <input id="username-input" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" autocomplete="off" required placeholder="3–20 letters, digits or _" />
    <button type="submit" class="green">REGISTER</button></form>
    <button type="button" id="leaderboard-btn" class="purple">LEADERBOARD 🏆</button>`;
  menu.insertBefore(box, menu.querySelector('.footer'));
  const leader = document.createElement('section');
  leader.id = 'leaderboard'; leader.className = 'screen hidden';
  leader.innerHTML = `<h2>LEADERBOARD 🏆</h2><p>Best scores across all players</p>
    <div id="leaderboard-content" aria-live="polite">Loading...</div>
    <button class="gold back" id="leaderboard-back">BACK</button>`;
  $('app').appendChild(leader);
  $('leaderboard-btn').addEventListener('click', showLeaderboard);
  $('leaderboard-back').addEventListener('click', () => {
    $('leaderboard').classList.add('hidden'); $('menu').classList.remove('hidden');
  });
  $('username-form').addEventListener('submit', register);
  for (const id of ['play','shop-btn']) {
    $(id).addEventListener('click', e => {
      if (!registered) { e.stopImmediatePropagation(); status('Choose a username before playing.'); }
    }, true);
  }
}

function localData() {
  try {
    const p = JSON.parse(localStorage.getItem('flappy-adventure-progress-v1') || '{}');
    return { best: Number.isSafeInteger(p.best) ? Math.max(0,p.best) : 0,
      coins: Number.isSafeInteger(p.coins) ? Math.max(0,p.coins) : 0,
      selectedSkin: typeof p.selected === 'string' ? p.selected : 'BIRD',
      unlockedSkins: Array.isArray(p.unlocked) ? p.unlocked : ['BIRD'] };
  } catch { return { best:0, coins:0, selectedSkin:'BIRD', unlockedSkins:['BIRD'] }; }
}
async function initUser(user) {
  uid = user.uid;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      registered = true;
      remoteBest = Number(snap.data().highScore || 0);
      status(`PLAYER: ${snap.data().username}`);
      $('username-form').hidden = true;
      const local = localData();
      if (remoteBest > local.best) {
        const p = JSON.parse(localStorage.getItem('flappy-adventure-progress-v1') || '{}');
        p.best = remoteBest;
        localStorage.setItem('flappy-adventure-progress-v1', JSON.stringify(p));
        // game.js loads progress on startup, so refresh once if needed.
        if (sessionStorage.getItem('flappy-cloud-reloaded') !== '1') {
          sessionStorage.setItem('flappy-cloud-reloaded', '1');
          location.reload();
        }
      }
    } else {
      status('Choose a username to create your account.');
      $('username-form').hidden = false;
    }
  } catch (err) { status('Connection error. Check Firebase rules and internet access.'); console.error(err); }
}

async function register(e) {
  e.preventDefault();
  if (!uid || registered) return;
  const raw = $('username-input').value.trim();
  const name = raw.toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(name)) { status('Use 3–20 English letters, digits or _.'); return; }
  const submit = $('username-form').querySelector('button');
  submit.disabled = true;
  try {
    // Two documents are committed atomically; Firestore rules validate both.
    const usernameRef = doc(db, 'usernames', name);
    const userRef = doc(db, 'users', uid);
    const taken = await getDoc(usernameRef);
    if (taken.exists()) { status('Username already taken!'); return; }
    const batch = writeBatch(db);
    batch.set(usernameRef, { uid });
    batch.set(userRef, { username: raw, usernameLower: name, highScore: 0, coins: 0 });
    await batch.commit();
    registered = true; status(`PLAYER: ${raw}`); $('username-form').hidden = true;
  } catch (err) {
    status('Name unavailable or registration failed. Try another name.');
    console.error(err);
  } finally { submit.disabled = false; }
}

async function showLeaderboard() {
  $('menu').classList.add('hidden'); $('leaderboard').classList.remove('hidden');
  $('leaderboard-content').textContent = 'Loading...';
  try {
    const snap = await getDocs(query(collection(db,'users'),orderBy('highScore','desc'),limit(10)));
    const table = document.createElement('ol');
    for (const row of snap.docs) {
      const li = document.createElement('li');
      li.textContent = `${row.data().username || 'Player'} — ${row.data().highScore || 0}`;
      table.append(li);
    }
    $('leaderboard-content').replaceChildren(table);
    if (snap.empty) $('leaderboard-content').textContent = 'No scores yet!';
  } catch (err) { $('leaderboard-content').textContent = 'Could not load leaderboard.'; console.error(err); }
}

// Scores are sent only after game over. The existing game logic remains intact.
async function maybeSaveBest() {
  if (!registered || updating || !uid) return;
  const box = $('overlay');
  if (box.classList.contains('hidden') || $('overlay-title').textContent !== 'GAME OVER') return;
  const best = localData().best;
  if (best <= remoteBest) return;
  updating = true;
  try {
    await updateDoc(doc(db,'users',uid), { highScore: best });
    remoteBest = best;
  } catch(err) { console.error('Could not upload best score:',err); }
  finally { updating = false; }
}

installUI();
const observer = new MutationObserver(() => { void maybeSaveBest(); });
observer.observe($('overlay'), { attributes:true, childList:true, subtree:true, characterData:true });
signInAnonymously(auth).catch(err => { status('Sign-in failed. Check Anonymous Authentication.'); console.error(err); });
onAuthStateChanged(auth, user => { if(user) void initUser(user); });
