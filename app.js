(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const defaults = window.AROHA_DEFAULTS || {departments:[]};
  const cfg = window.AROHA_CONFIG || {};
  const configured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('YOUR-PROJECT') && !cfg.supabaseAnonKey.includes('YOUR_'));
  const db = configured && window.supabase?.createClient ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  let departments = defaults.departments || [];
  let events = [];
  let results = [];
  let scores = [];
  let gallery = [];
  let toastTimer;

  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase();
  const awardPoints = (type, place) => type === 'group' ? ({1:10,2:7,3:2}[place] || 0) : ({1:5,2:3,3:1}[place] || 0);
  const placeName = (p) => ({1:'FIRST PLACE',2:'SECOND PLACE',3:'THIRD PLACE'}[p] || 'WINNER');
  function photoUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const result = db?.storage.from('aroha-winner-photos').getPublicUrl(path);
    return result?.data?.publicUrl || '';
  }
  function toast(message) {
    const el = $('siteToast'); if (!el) return;
    el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function renderEvents(filter = 'All') {
    const list = events.filter(e => filter === 'All' || e.category === filter);
    $('eventCount').innerHTML = `THE PROGRAMME <b>${list.length}</b>`;
    $('heroEventCount').textContent = events.filter(e => e.competition_type !== 'programme').length;
    $('eventGrid').innerHTML = list.length ? list.map((e, i) => `
      <article class="event-card"><div class="event-card-top"><span class="event-category">${esc(e.category || 'Event')}</span><span class="event-number">${String(i+1).padStart(2,'0')}</span></div>
      <h3>${esc(e.title)}</h3><div class="event-details"><span>${esc(e.event_date || 'DATE TBA')}</span>${e.event_time ? `<span>${esc(e.event_time)}</span>` : ''}<span>${esc(e.venue || 'VENUE TBA')}</span></div><span class="event-type">${esc(e.competition_type === 'group' ? 'GROUP COMPETITION' : e.competition_type === 'individual' ? 'INDIVIDUAL COMPETITION' : 'PROGRAMME')}</span></article>`).join('') : '<div class="empty-state">The official programme will be published here by the organisers.</div>';
  }

  function renderWinnerFilters() {
    const select = $('winnerDepartment');
    select.innerHTML = '<option value="All">ALL DEPARTMENTS</option>' + departments.map(d => `<option value="${esc(d.code)}">${esc(d.name)}</option>`).join('');
  }

  function renderWinners() {
    const department = $('winnerDepartment').value;
    const type = $('winnerType').value;
    const list = results.filter(r => (department === 'All' || r.department_code === department) && (type === 'All' || r.event?.competition_type === type));
    $('winnerCount').innerHTML = `WINNERS DIRECTORY <b>${list.length}</b>`;
    $('winnerGrid').innerHTML = list.length ? list.map(r => {
      const person = r.event?.competition_type === 'group' ? (r.team_name || 'Winning team') : (r.winner_name || 'Winner');
      const points = awardPoints(r.event?.competition_type, Number(r.placement));
      const img = photoUrl(r.image_path);
      return `<article class="winner-card"><div class="winner-image">${img ? `<img src="${esc(img)}" alt="${esc(person)}" loading="lazy" onerror="this.remove()">` : `<div class="initials">${esc(initials(person))}</div>`}</div><div class="winner-copy"><span class="winner-place">${placeName(Number(r.placement))}</span><h3>${esc(person)}</h3><span class="winner-event">${esc(r.event?.title || 'Competition')}</span><span class="winner-dept">${esc(r.department?.name || r.department_code)}</span><span class="winner-points">${points} POINT${points === 1 ? '' : 'S'} · ${r.event?.competition_type === 'group' ? 'GROUP' : 'INDIVIDUAL'}</span></div></article>`;
    }).join('') : '<div class="empty-state">Official winners will appear here as soon as stage-control results are published.</div>';
  }

  function renderScores() {
    const ordered = [...scores].sort((a,b) => Number(b.points)-Number(a.points) || Number(b.gold)-Number(a.gold) || Number(b.silver)-Number(a.silver) || Number(b.bronze)-Number(a.bronze) || Number(a.display_order)-Number(b.display_order));
    $('championName').textContent = (ordered[0] && Number(ordered[0].points) > 0) ? ordered[0].name : 'TO BE DECIDED';
    const rows = ordered.map((d, i) => `<div class="score-row ${i === 0 && Number(d.points) > 0 ? 'champion' : ''}"><span class="rank-no">${String(i+1).padStart(2,'0')}</span><span class="score-dept-name">${esc(d.name)}</span><span class="medal-count">${Number(d.gold)||0}</span><span class="medal-count">${Number(d.silver)||0}</span><span class="medal-count">${Number(d.bronze)||0}</span><strong class="score-total">${Number(d.points)||0}</strong></div>`).join('');
    $('scoreTable').innerHTML = `<div class="score-table-head"><span>RANK</span><span>DEPARTMENT</span><span>G</span><span>S</span><span>B</span><span>POINTS</span></div>${rows || '<div class="score-empty">Department scores will appear here.</div>'}`;
  }

  function renderGallery() {
    $('galleryGrid').innerHTML = gallery.length ? gallery.map((g, i) => {
      const src = photoUrl(g.image_path);
      return `<div class="gallery-item" tabindex="0" role="button" aria-label="Open ${esc(g.caption || 'AROHA photograph')}" data-src="${esc(src)}" data-caption="${esc(g.caption || '')}"><img src="${esc(src)}" alt="${esc(g.caption || 'AROHA ’26 photograph')}" loading="lazy"><span class="gallery-caption">${esc(g.caption || `AROHA MOMENT ${i+1}`)}</span></div>`;
    }).join('') : '<div class="empty-state gallery-empty">Photographs from AROHA ’26 will be added to the gallery.</div>';
    document.querySelectorAll('.gallery-item').forEach(item => {
      const open = () => { $('lightboxImage').src = item.dataset.src; $('lightboxCaption').textContent = item.dataset.caption; $('lightbox').classList.add('open'); $('lightbox').setAttribute('aria-hidden','false'); };
      item.addEventListener('click', open);
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  async function loadRemoteData() {
    if (!db) {
      scores = departments.map(d => ({...d, gold:0, silver:0, bronze:0, points:0}));
      return;
    }
    const [deptRes, eventRes, resultRes, scoreRes, galleryRes] = await Promise.all([
      db.from('departments').select('code,name,display_order').order('display_order'),
      db.from('events').select('id,title,category,competition_type,event_date,event_time,venue').eq('is_published', true).order('event_date', {ascending:true, nullsFirst:true}),
      db.from('results').select('id,placement,winner_name,team_name,department_code,image_path,event:events(title,competition_type),department:departments(name,code)').eq('is_published', true).order('placement'),
      db.from('department_scoreboard').select('code,name,display_order,gold,silver,bronze,points'),
      db.from('gallery_items').select('id,caption,image_path,created_at').eq('is_published', true).order('created_at', {ascending:false})
    ]);
    const failures = [deptRes,eventRes,resultRes,scoreRes,galleryRes].filter(x => x.error);
    if (failures.length) {
      console.error('AROHA data loading:', failures.map(x => x.error));
      toast('Some live information could not be loaded. Please refresh or contact the organiser.');
    }
    if (deptRes.data?.length) departments = deptRes.data;
    events = eventRes.data || [];
    results = resultRes.data || [];
    scores = scoreRes.data?.length ? scoreRes.data : departments.map(d => ({...d,gold:0,silver:0,bronze:0,points:0}));
    gallery = galleryRes.data || [];
  }

  function setupDancerScroll() {
    const dancer = $('scrollDancer');
    if (!dancer || window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.innerWidth <= 650) return;
    let scheduled = false;
    const update = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      const x = Math.sin(progress * Math.PI) * -17;
      const y = 34 - progress * 75;
      const rotation = -4 + progress * 8;
      const visible = progress > 0.045 && progress < 0.93;
      dancer.style.opacity = visible ? String(0.13 + Math.sin(progress * Math.PI) * 0.12) : '0';
      dancer.style.transform = `translate3d(${x}vw,${y}vh,0) rotate(${rotation}deg)`;
      scheduled = false;
    };
    window.addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }, {passive:true});
    window.addEventListener('resize', update); update();
  }

  $('eventFilters').addEventListener('click', e => {
    const button = e.target.closest('[data-filter]'); if (!button) return;
    document.querySelectorAll('#eventFilters button').forEach(b => b.classList.toggle('active', b === button)); renderEvents(button.dataset.filter);
  });
  $('winnerDepartment').addEventListener('change', renderWinners);
  $('winnerType').addEventListener('change', renderWinners);
  $('menuToggle').addEventListener('click', () => { const open = $('mainNav').classList.toggle('open'); $('menuToggle').setAttribute('aria-expanded', String(open)); });
  document.querySelectorAll('#mainNav a').forEach(a => a.addEventListener('click', () => $('mainNav').classList.remove('open')));
  $('lightboxClose').addEventListener('click', () => { $('lightbox').classList.remove('open'); $('lightbox').setAttribute('aria-hidden','true'); $('lightboxImage').src=''; });
  $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightboxClose').click(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('lightboxClose').click(); });

  (async () => {
    try { await loadRemoteData(); }
    catch (e) { console.error(e); scores = departments.map(d => ({...d,gold:0,silver:0,bronze:0,points:0})); }
    renderEvents(); renderWinnerFilters(); renderWinners(); renderScores(); renderGallery(); setupDancerScroll();
  })();
})();
