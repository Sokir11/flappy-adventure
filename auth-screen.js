import {getAuth, onAuthStateChanged, signOut} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore, doc, getDoc} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  const $=id=>document.getElementById(id);
  for(let i=0;i<100&&!$('online-form');i++) await delay(100);
  if(!$('online-form')) { document.getElementById('auth-boot')?.remove(); return; }
  const menu=$('menu'), auth=getAuth(getApp()), db=getFirestore(getApp());
  const screen=document.createElement('section');
  screen.id='auth-gate';screen.className='screen';
  screen.style.cssText='justify-content:center;gap:12px;padding:25px';
  screen.innerHTML='<h1>🐤 FLAPPY ADVENTURE</h1><h2 style="font-size:24px">WELCOME!</h2><p>Log in or register to play</p>';
  $('app').append(screen);
  screen.append($('online-status'),$('online-form'));
  const choose=document.createElement('button');choose.className='blue';choose.type='button';choose.textContent='USE A DIFFERENT ACCOUNT';screen.append(choose);
  const account=$('online-current');
  const switchBtn=document.createElement('button');switchBtn.className='blue';switchBtn.type='button';switchBtn.textContent='CHANGE ACCOUNT';
  account.prepend(switchBtn);
  const name=document.createElement('p');name.id='account-name';name.style.fontWeight='bold';account.prepend(name);
  const newSession=async()=>{
    if(!confirm('Switch accounts? You will need the other account’s password to log in.'))return;
    try { await signOut(auth); }
    catch(e){alert('Unable to switch accounts: '+(e.code||e.message));}
  };
  switchBtn.addEventListener('click',newSession);choose.addEventListener('click',newSession);
  let checkSeq=0;
  function gate(open){
    screen.classList.toggle('hidden',open);
    menu.classList.toggle('hidden',!open);
    document.getElementById('auth-boot')?.remove();
  }
  async function refresh(user){
    const seq=++checkSeq;
    if(!user){gate(false);return;}
    try{
      const snap=await getDoc(doc(db,'users',user.uid));
      if(seq!==checkSeq)return;
      if(snap.exists()&&!user.isAnonymous){
        name.textContent='👤 PLAYER: '+(snap.data().username||'Player');
        gate(true);
      }else{
        gate(false);
        if(snap.exists()&&user.isAnonymous){
          $('online-name').value=snap.data().username||'';
          $('online-form').hidden=false;
          $('online-register').textContent='SAVE PASSWORD';
          $('online-status').textContent='This is an older account. Add a password to continue.';
          choose.textContent='USE A DIFFERENT ACCOUNT';
        }else{
          $('online-form').hidden=false;
          $('online-register').textContent='REGISTER';
          choose.textContent='USE A DIFFERENT ACCOUNT';
        }
      }
    }catch(e){gate(false);$('online-status').textContent='Connection error: '+(e.code||e.message);}
  }
  onAuthStateChanged(auth,u=>void refresh(u));
  // Account upgrades can change the sign-in method without a user-id change.
  $('online-form').addEventListener('submit',()=>setTimeout(()=>void refresh(auth.currentUser),850));
  $('online-login').addEventListener('click',()=>setTimeout(()=>void refresh(auth.currentUser),850));
}
main().catch(e=>{console.error('Account screen:',e);document.getElementById('auth-boot')?.remove();});
