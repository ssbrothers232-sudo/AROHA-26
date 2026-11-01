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
  let festivalSettings = null;
  let toastTimer;
  let publicRefreshTimer = null;

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
      return `<article class="winner-card"><div class="winner-image">${img ? `<img src="${esc(img)}" alt="${esc(person)}" loading="lazy" onerror="this.remove()">` : `<div class="initials">${esc(initials(person))}</div>`}</div><div class="winner-copy"><span class="winner-place">${placeName(Number(r.placement))}</span><h3>${esc(person)}</h3><span class="winner-event">${esc(r.event?.title || 'Competition')}</span><span class="winner-dept">${esc(r.department?.name || r.department_code)}</span><span class="winner-points">${points} POINT${points === 1 ? '' : 'S'} · ${r.event?.competition_type === 'group' ? 'GROUP' : 'INDIVIDUAL'}</span><div class="winner-card-actions"><button type="button" class="winner-share" data-share-winner="${esc(r.id)}">↗ SHARE WINNER POST</button><button type="button" class="winner-certificate" data-certificate-winner="${esc(r.id)}">↓ DOWNLOAD CERTIFICATE</button></div></div></article>`;
    }).join('') : '<div class="empty-state">Official winners will appear here as soon as stage-control results are published.</div>';
  }

  function drawCover(ctx, image, x, y, width, height) {
    const scale = Math.max(width / image.width, height / image.height);
    const sw = width / scale, sh = height / scale;
    const sx = (image.width - sw) / 2, sy = (image.height - sh) / 2;
    ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
    const words = String(text || '').split(/\s+/);
    let line = '', lines = [];
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line); line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1];
      while (ctx.measureText(last + '…').width > maxWidth && last.length > 3) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    lines.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
    return lines.length;
  }

  async function buildWinnerPost(result) {
    const width = 1080, height = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not create the winner poster.');

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#210811'); bg.addColorStop(.55, '#451b29'); bg.addColorStop(1, '#1d0710');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(222,185,112,.32)'; ctx.lineWidth = 2;
    ctx.strokeRect(34, 34, width - 68, height - 68);
    [160, 250, 390].forEach((radius, i) => {
      ctx.beginPath(); ctx.arc(width - 80, 110, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(70, height - 60, radius * .72, 0, Math.PI * 2); ctx.stroke();
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e9ce91'; ctx.font = '600 29px Georgia, serif';
    ctx.fillText('MGCSIILS CHERUVARAKONAM', width / 2, 94);
    ctx.fillStyle = '#b9955d'; ctx.font = '700 17px Arial, sans-serif';
    ctx.fillText('PRESENTS', width / 2, 130);
    ctx.fillStyle = '#f1d99e'; ctx.font = '600 91px Georgia, serif';
    ctx.fillText('AROHA ’26', width / 2, 226);
    ctx.fillStyle = '#d9c19a'; ctx.font = '600 18px Arial, sans-serif';
    ctx.fillText('THE ANNUAL ARTS FESTIVAL', width / 2, 270);

    const photoX = 112, photoY = 315, photoW = 856, photoH = 510;
    const gradient = ctx.createLinearGradient(photoX, photoY, photoX + photoW, photoY + photoH);
    gradient.addColorStop(0, '#e6d0a7'); gradient.addColorStop(1, '#9c7047');
    ctx.fillStyle = gradient; ctx.fillRect(photoX, photoY, photoW, photoH);

    if (result.image_path) {
      try {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = photoUrl(result.image_path);
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('Could not load winner photograph'));
        });
        ctx.save(); ctx.beginPath(); ctx.rect(photoX, photoY, photoW, photoH); ctx.clip();
        drawCover(ctx, image, photoX, photoY, photoW, photoH);
        ctx.restore();
      } catch (error) {
        ctx.fillStyle = '#351722'; ctx.font = '600 112px Georgia, serif';
        ctx.fillText(initials(result.event?.competition_type === 'group' ? result.team_name : result.winner_name), width / 2, photoY + 285);
      }
    } else {
      ctx.fillStyle = '#351722'; ctx.font = '600 112px Georgia, serif';
      ctx.fillText(initials(result.event?.competition_type === 'group' ? result.team_name : result.winner_name), width / 2, photoY + 285);
    }

    const type = result.event?.competition_type || 'individual';
    const person = type === 'group' ? (result.team_name || 'Winning team') : (result.winner_name || 'Winner');
    const department = result.department?.name || result.department_code || 'Department';
    const eventName = result.event?.title || 'Competition';
    const points = awardPoints(type, Number(result.placement));
    const place = placeName(Number(result.placement));

    ctx.fillStyle = '#e8c77e'; ctx.fillRect(112, 856, 856, 4);
    ctx.fillStyle = '#f1d99e'; ctx.font = '700 24px Arial, sans-serif';
    ctx.fillText(place, width / 2, 922);
    ctx.fillStyle = '#fff3db';
    const nameFont = person.length > 26 ? 48 : person.length > 18 ? 58 : 70;
    ctx.font = `600 ${nameFont}px Georgia, serif`;
    wrapCanvasText(ctx, person, width / 2, 1000, 880, nameFont + 12, 2);

    ctx.fillStyle = '#e0c18b'; ctx.font = '700 30px Arial, sans-serif';
    ctx.fillText(department.toUpperCase(), width / 2, 1100);
    ctx.fillStyle = '#e7d6bd'; ctx.font = '500 24px Arial, sans-serif';
    wrapCanvasText(ctx, eventName.toUpperCase(), width / 2, 1150, 870, 31, 2);
    ctx.fillStyle = '#30121b'; ctx.fillRect(390, 1210, 300, 66);
    ctx.fillStyle = '#f2d69b'; ctx.font = '700 27px Arial, sans-serif';
    ctx.fillText(`${points} POINT${points === 1 ? '' : 'S'} · ${type.toUpperCase()}`, width / 2, 1252);
    ctx.fillStyle = '#d5bb8e'; ctx.font = '600 17px Arial, sans-serif';
    ctx.fillText('THE ART OF BEING ALIVE · AROHA ’26', width / 2, 1310);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The winner poster could not be exported.');
    const safeName = person.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'winner';
    return new File([blob], `aroha-26-${safeName}-winner.png`, {type:'image/png'});
  }

  async function shareWinnerPost(resultId, button) {
    const result = results.find(item => item.id === resultId);
    if (!result) return;
    const original = button.textContent;
    button.disabled = true; button.textContent = 'PREPARING POST…';
    try {
      const file = await buildWinnerPost(result);
      const shareData = {
        files: [file],
        title: `AROHA ’26 · ${result.winner_name || result.team_name || 'Winner'}`,
        text: `${placeName(Number(result.placement))} · ${result.event?.title || 'AROHA competition'} · ${result.department?.name || result.department_code} · AROHA ’26`
      };
      if (navigator.canShare && navigator.canShare({files:[file]}) && navigator.share) {
        await navigator.share(shareData);
        toast('Winner post shared.');
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        toast('Winner poster downloaded. You can share it on WhatsApp or Instagram.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('AROHA winner share:', error);
        toast(error.message || 'Could not create the winner post.');
      }
    } finally {
      button.disabled = false; button.textContent = original;
    }
  }


  function fitCertificateFont(ctx, text, maxWidth, family, maxSize, minSize) {
    let size = maxSize;
    while (size > minSize) {
      ctx.font = `600 ${size}px ${family}`;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 1;
    }
    return size;
  }

  async function loadCertificateBackground() {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(
        'Certificate background is missing. Please upload aroha-certificate-bg.webp to assets/images in the AROHA-26 repository.'
      ));
      image.src = 'assets/images/aroha-certificate-bg.webp?v=1';
    });
  }

  async function downloadWinnerCertificate(resultId, button) {
    const result = results.find(item => item.id === resultId);
    if (!result) return;
    const JsPDF = window.jspdf?.jsPDF;
    if (!JsPDF) {
      toast('Certificate PDF library did not load. Please refresh and try again.');
      return;
    }

    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'PREPARING CERTIFICATE…';

    try {
      const type = result.event?.competition_type || 'individual';
      const person = type === 'group'
        ? (result.team_name || 'Winning team')
        : (result.winner_name || 'Winner');
      const eventName = result.event?.title || 'Competition';
      const placement = Number(result.placement);
      const position = ({1:'1st', 2:'2nd', 3:'3rd'}[placement] || 'Winner');

      const canvas = document.createElement('canvas');
      canvas.width = 1536;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Your browser could not prepare the certificate.');

      const background = await loadCertificateBackground();
      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#4b1b0d';

      // Participant / team name on the long blank line.
      const nameSize = fitCertificateFont(
        ctx, person, 730, "Georgia, 'Times New Roman', serif", 48, 24
      );
      ctx.font = `600 ${nameSize}px Georgia, 'Times New Roman', serif`;
      ctx.fillText(person, 982, 666, 730);

      // Fill the two printed blanks in the achievement sentence.
      const positionSize = fitCertificateFont(
        ctx, position, 165, "Georgia, 'Times New Roman', serif", 23, 15
      );
      ctx.font = `600 ${positionSize}px Georgia, 'Times New Roman', serif`;
      ctx.fillStyle = '#4b1b0d';
      ctx.fillText(position, 758, 723, 165);

      const eventSize = fitCertificateFont(
        ctx, eventName, 400, "Georgia, 'Times New Roman', serif", 22, 11
      );
      ctx.font = `600 ${eventSize}px Georgia, 'Times New Roman', serif`;
      ctx.fillText(eventName, 1168, 723, 400);

      const backgroundData = canvas.toDataURL('image/jpeg', 0.96);
      const pdf = new JsPDF({orientation:'landscape', unit:'mm', format:'a4'});
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, 297, 210, 'F');

      // The source design is 3:2. Fit it inside A4 without cropping or distorting it.
      pdf.addImage(backgroundData, 'JPEG', 0, 6, 297, 198, undefined, 'FAST');
      pdf.setProperties({
        title: `AROHA ’26 Certificate - ${person}`,
        subject: `${position} position in ${eventName}`,
        author: 'MGCSIILS, Cheruvarakonam'
      });

      const safeName = person.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'winner';
      pdf.save(`aroha-26-${safeName}-certificate.pdf`);
      toast('Personalized AROHA certificate downloaded.');
    } catch (error) {
      console.error('AROHA certificate:', error);
      toast(error.message || 'Could not create certificate.');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function sortedScores() {
    return [...scores].sort((a,b) => Number(b.points)-Number(a.points) || Number(b.gold)-Number(a.gold) || Number(b.silver)-Number(a.silver) || Number(b.bronze)-Number(a.bronze) || Number(a.display_order)-Number(b.display_order));
  }

  function renderChampionshipRace(ordered) {
    const host = $('championshipRace');
    if (!host) return;
    const leaderPoints = Number(ordered[0]?.points) || 0;
    host.innerHTML = ordered.map((department,index) => {
      const points = Number(department.points) || 0;
      const percent = leaderPoints > 0 ? Math.max(3, Math.round(points / leaderPoints * 100)) : 0;
      const gap = index === 0 && points > 0 ? 'CURRENT LEADER' : leaderPoints > points ? `${leaderPoints-points} PTS BEHIND` : 'ON THE BOARD';
      return `<div class="race-row"><div class="race-row-top"><strong>${esc(department.name)}</strong><span>${points} PTS · ${gap}</span></div><div class="race-track"><i style="width:${percent}%"></i></div></div>`;
    }).join('') || '<p class="score-footnote">Department standings will appear as results are published.</p>';
  }

  function renderChampionshipFinale(ordered) {
    const locked = $('finaleLocked'), revealed = $('finaleRevealed');
    if (!locked || !revealed) return;
    const isRevealed = Boolean(festivalSettings?.championship_revealed);
    locked.hidden = isRevealed;
    revealed.hidden = !isRevealed;
    const liveLeader = ordered[0] || null;
    if (isRevealed) {
      const championCodes = festivalSettings.champion_departments || [];
      const champions = championCodes.map(code => departments.find(dept => dept.code === code)?.name || code);
      $('finaleChampionNames').textContent = champions.length ? champions.join(' · ') : (liveLeader?.name || 'CHAMPION');
      $('finaleChampionPoints').textContent = Number(festivalSettings.champion_points ?? liveLeader?.points ?? 0).toLocaleString('en-IN');
      const gold = Number(festivalSettings.champion_gold ?? liveLeader?.gold ?? 0);
      const silver = Number(festivalSettings.champion_silver ?? liveLeader?.silver ?? 0);
      const bronze = Number(festivalSettings.champion_bronze ?? liveLeader?.bronze ?? 0);
      $('finaleChampionMedals').textContent = `🥇 ${gold} GOLD   ·   🥈 ${silver} SILVER   ·   🥉 ${bronze} BRONZE`;
    }
  }

  function renderScores() {
    const ordered = sortedScores();
    const leader = ordered[0] && Number(ordered[0].points) > 0 ? ordered[0] : null;
    $('championName').textContent = leader ? leader.name : 'TO BE DECIDED';
    const label = $('championStatusLabel');
    if (label) label.textContent = festivalSettings?.championship_revealed ? 'OFFICIAL CHAMPION' : 'CURRENT LEADER';
    const rows = ordered.map((d, i) => `<div class="score-row ${i === 0 && Number(d.points) > 0 ? 'champion' : ''}"><span class="rank-no">${String(i+1).padStart(2,'0')}</span><span class="score-dept-name">${esc(d.name)}</span><span class="medal-count">${Number(d.gold)||0}</span><span class="medal-count">${Number(d.silver)||0}</span><span class="medal-count">${Number(d.bronze)||0}</span><strong class="score-total">${Number(d.points)||0}</strong></div>`).join('');
    $('scoreTable').innerHTML = `<div class="score-table-head"><span>RANK</span><span>DEPARTMENT</span><span>G</span><span>S</span><span>B</span><span>POINTS</span></div>${rows || '<div class="score-empty">Department scores will appear here.</div>'}`;
    renderChampionshipRace(ordered);
    renderChampionshipFinale(ordered);
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
      festivalSettings = null;
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
    try {
      const {data,error} = await db.from('festival_settings').select('championship_revealed,champion_departments,champion_points,champion_gold,champion_silver,champion_bronze').eq('singleton',true).maybeSingle();
      festivalSettings = error ? null : data;
      if (error) console.info('Festival finale control not installed yet; run supabase/add-festival-features.sql.');
    } catch (error) {
      festivalSettings = null;
      console.info('Festival finale settings unavailable:', error);
    }
  }


  function setupFestivalCountdown() {
    const target = new Date('2026-11-05T09:00:00+05:30').getTime();
    const finish = new Date('2026-11-13T13:00:00+05:30').getTime();
    const tick = () => {
      const now = Date.now();
      if (now < target) {
        const distance = target - now;
        $('countdownHeadline').textContent = 'COUNTING DOWN TO AROHA ’26';
        $('countdownSubline').textContent = 'THE FESTIVAL OPENS · 5 NOVEMBER 2026 · 9:00 AM';
        $('countdownClock').hidden = false;
        $('countDays').textContent = String(Math.floor(distance / 86400000)).padStart(2,'0');
        $('countHours').textContent = String(Math.floor(distance % 86400000 / 3600000)).padStart(2,'0');
        $('countMinutes').textContent = String(Math.floor(distance % 3600000 / 60000)).padStart(2,'0');
        $('countSeconds').textContent = String(Math.floor(distance % 60000 / 1000)).padStart(2,'0');
      } else if (now < finish) {
        $('countdownHeadline').textContent = 'AROHA ’26 IS IN FULL FLOW';
        $('countdownSubline').textContent = 'THE STAGE IS ALIVE · 5–13 NOVEMBER 2026';
        $('countdownClock').hidden = true;
      } else {
        $('countdownHeadline').textContent = 'THE ART WILL REMAIN';
        $('countdownSubline').textContent = 'THANK YOU FOR MAKING AROHA ’26 UNFORGETTABLE';
        $('countdownClock').hidden = true;
      }
    };
    tick();
    setInterval(tick,1000);
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
  $('winnerGrid').addEventListener('click', e => {
    const shareButton = e.target.closest('[data-share-winner]');
    const certificateButton = e.target.closest('[data-certificate-winner]');
    if (shareButton) shareWinnerPost(shareButton.dataset.shareWinner, shareButton);
    if (certificateButton) downloadWinnerCertificate(certificateButton.dataset.certificateWinner, certificateButton);
  });
  $('menuToggle').addEventListener('click', () => { const open = $('mainNav').classList.toggle('open'); $('menuToggle').setAttribute('aria-expanded', String(open)); });
  document.querySelectorAll('#mainNav a').forEach(a => a.addEventListener('click', () => $('mainNav').classList.remove('open')));
  $('lightboxClose').addEventListener('click', () => { $('lightbox').classList.remove('open'); $('lightbox').setAttribute('aria-hidden','true'); $('lightboxImage').src=''; });
  $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightboxClose').click(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('lightboxClose').click(); });

  (async () => {
    setupFestivalCountdown();
    try { await loadRemoteData(); }
    catch (e) { console.error(e); scores = departments.map(d => ({...d,gold:0,silver:0,bronze:0,points:0})); }
    renderEvents(); renderWinnerFilters(); renderWinners(); renderScores(); renderGallery(); setupDancerScroll();
    if (db) {
      publicRefreshTimer = setInterval(async () => {
        try {
          await loadRemoteData();
          renderEvents(); renderWinners(); renderScores(); renderGallery();
        } catch (error) { console.error('AROHA live refresh:', error); }
      }, 25000);
    }
  })();
})();
