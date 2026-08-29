// Swipe tab: Tinder-style deck over the same matches as Explore (FTApp.getMatches).
// Each card = one neighbour's fridge + up to 2 dishes you could cook together.
// Hold a dish and swipe right to send an anonymous invite for it; swipe left to pass.

let swLoaded = false;
let swStack = []; // [{ el, match }], index 0 is the top card

document.addEventListener('tabshown', (e) => {
  if (e.detail !== 'swipe' || !FTApp.state.profileComplete) return;
  if (!swLoaded) loadSwipe();
});

el('swRefresh').addEventListener('click', () => {
  FTApp.refreshMatches();
  loadSwipe();
});
el('swNope').addEventListener('click', () => flingTop(-1));
el('swLike').addEventListener('click', () => flingTop(1));

async function loadSwipe() {
  swLoaded = true;
  ['swDeckWrap', 'swEmpty', 'swNoMatch', 'swErr'].forEach((id) => hide(el(id)));
  show(el('swLoading'));
  try {
    const data = await FTApp.getMatches();
    hide(el('swLoading'));
    if (!data.matches.length) return show(el('swNoMatch'));
    buildDeck(data.matches);
    show(el('swDeckWrap'));
  } catch (e) {
    hide(el('swLoading'));
    el('swErr').textContent = e.message;
    show(el('swErr'));
  }
}

function buildDeck(matches) {
  const deck = el('swDeck');
  deck.innerHTML = '';
  swStack = matches.map((m) => ({ el: buildCard(m), match: m }));
  swStack.forEach((c) => deck.appendChild(c.el));
  restack();
}

function buildCard(m) {
  const card = document.createElement('div');
  card.className = 'sw-card';
  m._sel = 0;
  const dishes = m.dishes.slice(0, 2);
  card.innerHTML = `
    <div class="sw-stamp like">INVITE</div>
    <div class="sw-stamp nope">PASS</div>
    <div class="sw-emoji like">&#128525;&#10084;&#65039;</div>
    <div class="sw-emoji nope">&#128546;&#128148;</div>
    <img class="sw-photo" src="${m.photo}" alt="${m.name}'s fridge" draggable="false" />
    <div class="sw-grad"></div>
    <div class="sw-info">
      <div class="sw-title">
        <h3>${m.name}<small>'s fridge</small></h3>
        <span class="score-badge ${m.score >= 80 ? '' : 'mid'}">${m.score}<small>match</small></span>
      </div>
      <p class="sw-meta">&#128205; ${fmtDist(m.distance_m)}${m.invite_pending ? ' \u00b7 invite already pending' : ''}</p>
      <div class="sw-dishes">
        ${dishes
          .map(
            (d, i) => `
          <div class="sw-dish${i === 0 ? ' selected' : ''}" data-i="${i}">
            <h4>${d.name}</h4>
            <p>You bring: ${(d.uses_yours || []).join(', ') || '-'}</p>
            <p>They bring: ${(d.uses_theirs || []).join(', ') || '-'}</p>
          </div>`
          )
          .join('')}
      </div>
    </div>`;
  attachDrag(card, m);
  return card;
}

function selectDish(card, m, i) {
  m._sel = i;
  card
    .querySelectorAll('.sw-dish')
    .forEach((d) => d.classList.toggle('selected', Number(d.dataset.i) === i));
}

// ---------- drag mechanics ----------

function attachDrag(card, m) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dy = 0;
  let active = false;

  const likeStamp = card.querySelector('.sw-stamp.like');
  const nopeStamp = card.querySelector('.sw-stamp.nope');
  const likeEmoji = card.querySelector('.sw-emoji.like');
  const nopeEmoji = card.querySelector('.sw-emoji.nope');

  card.addEventListener('pointerdown', (e) => {
    if (!swStack.length || swStack[0].el !== card) return;
    const dish = e.target.closest('.sw-dish');
    if (dish) selectDish(card, m, Number(dish.dataset.i));
    active = true;
    dx = 0;
    dy = 0;
    startX = e.clientX;
    startY = e.clientY;
    card.setPointerCapture(e.pointerId);
    card.style.transition = 'none';
  });

  card.addEventListener('pointermove', (e) => {
    if (!active) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    card.style.transform = `translate(${dx}px, ${dy * 0.35}px) rotate(${dx * 0.06}deg)`;
    const likeAmt = Math.min(1, Math.max(0, dx / 90));
    const nopeAmt = Math.min(1, Math.max(0, -dx / 90));
    likeStamp.style.opacity = likeAmt;
    nopeStamp.style.opacity = nopeAmt;
    likeEmoji.style.opacity = likeAmt;
    nopeEmoji.style.opacity = nopeAmt;
    likeEmoji.style.transform = `translate(-50%, -50%) scale(${0.6 + likeAmt * 0.55})`;
    nopeEmoji.style.transform = `translate(-50%, -50%) scale(${0.6 + nopeAmt * 0.55})`;
  });

  const release = () => {
    if (!active) return;
    active = false;
    if (dx > 100) return fling(card, 1);
    if (dx < -100) return fling(card, -1);
    card.style.transition = 'transform 0.25s ease';
    card.style.transform = '';
    likeStamp.style.opacity = 0;
    nopeStamp.style.opacity = 0;
    likeEmoji.style.opacity = 0;
    nopeEmoji.style.opacity = 0;
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
}

function flingTop(dir) {
  if (swStack.length) fling(swStack[0].el, dir);
}

function fling(card, dir) {
  if (!swStack.length || swStack[0].el !== card) return;
  const { match } = swStack.shift();

  card.querySelector(dir > 0 ? '.sw-stamp.like' : '.sw-stamp.nope').style.opacity = 1;
  const emoji = card.querySelector(dir > 0 ? '.sw-emoji.like' : '.sw-emoji.nope');
  emoji.style.opacity = 1;
  emoji.style.transform = 'translate(-50%, -50%) scale(1.15)';
  card.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
  card.style.transform = `translate(${dir * (window.innerWidth + 140)}px, -30px) rotate(${dir * 18}deg)`;
  card.style.opacity = '0';
  setTimeout(() => card.remove(), 380);

  if (dir > 0) sendSwipeInvite(match);
  restack();
}

function sendSwipeInvite(m) {
  const dish = m.dishes[m._sel || 0];
  if (m.invite_pending) return toast(`You already have a pending invite to ${m.name}.`);
  FTApp.sendInvite(m.id, [dish])
    .then(() => {
      m.invite_pending = true;
      toast(`Anonymous invite sent to ${m.name}: ${dish.name}`);
    })
    .catch((e) => toast('Invite failed: ' + e.message));
}

function restack() {
  if (!swStack.length) {
    hide(el('swDeckWrap'));
    show(el('swEmpty'));
    return;
  }
  swStack.forEach((c, i) => {
    c.el.style.zIndex = String(200 - i);
    c.el.style.transition = 'transform 0.25s ease';
    c.el.style.transform =
      i === 0 ? '' : `scale(${1 - Math.min(i, 2) * 0.04}) translateY(${Math.min(i, 2) * 12}px)`;
  });
}
