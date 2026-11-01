(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cfg = window.AROHA_CONFIG || {};
  const configured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('YOUR-PROJECT') && !cfg.supabaseAnonKey.includes('YOUR_'));
  const db = configured && window.supabase?.createClient ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  let currentUser = null, currentRole = null, departments = [], events = [], results = [], toastTimer;
  const placePoints = (type, place) => type === 'group' ? ({1:10,2:7,3:2}[place] || 0) : ({1:5,2:3,3:1}[place] || 0);
  const roleAllowed = () => ['admin','stage_control'].includes(currentRole);

  function notice(elementId, message, kind='') {
    const el = $(elementId); if (!el) return;
    el.textContent = message; el.className = `admin-alert ${kind}`.trim(); el.classList.remove('admin-section-hidden');
  }
  function hideNotice(elementId) { $(elementId)?.classList.add('admin-section-hidden'); }
  function toast(message) {
    const el = $('adminToast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  function pointsLabel(type, place) {
    const n = placePoints(type, place);
    return `AWARD: ${n} POINT${n === 1 ? '' : 'S'} · ${type === 'group' ? 'GROUP' : 'INDIVIDUAL'} ${({1:'FIRST',2:'SECOND',3:'THIRD'}[place])} PLACE`;
  }
  function activeEvent() { return events.find(e => e.id === $('eventSelect').value); }
  function refreshTypeFields() {
    const event = activeEvent();
    const type = event?.competition_type;
    $('competitionTypeLabel').textContent = type === 'group' ? 'GROUP EVENT · 10 / 7 / 2 POINTS' : type === 'individual' ? 'INDIVIDUAL EVENT · 5 / 3 / 1 POINTS' : 'Select an event to see its type.';
    $('individualFields').classList.toggle('admin-section-hidden', type !== 'individual');
    $('groupFields').classList.toggle('admin-section-hidden', type !== 'group');
    $('winnerName').required = type === 'individual';
    $('teamName').required = type === 'group';
    refreshPoints();
  }
  function refreshPoints() {
    const type = activeEvent()?.competition_type || 'individual';
    const place = Number(document.querySelector('input[name="placement"]:checked')?.value || 1);
    $('pointsPreview').textContent = pointsLabel(type, place);
  }
  function populateSelects() {
    $('departmentSelect').innerHTML = '<option value="">Choose department</option>' + departments.map(d => `<option value="${esc(d.code)}">${esc(d.name)}</option>`).join('');
    const competitive = events.filter(e => e.competition_type !== 'programme');
    $('eventSelect').innerHTML = '<option value="">Choose a competition</option>' + competitive.map(e => `<option value="${esc(e.id)}">${esc(e.title)} · ${e.competition_type === 'group' ? 'GROUP' : 'INDIVIDUAL'}</option>`).join('');
    $('statEvents').textContent = competitive.length;
    refreshTypeFields();
  }
  function resetResultForm() {
    $('resultForm').reset(); $('editingResultId').value = ''; $('existingPhotoPath').value = '';
    $('resultFormTitle').textContent = 'Add a result'; $('submitResultBtn').textContent = 'PUBLISH RESULT →';
    $('eventSelect').disabled = false;
    document.querySelectorAll('input[name="placement"]').forEach(r => r.disabled = false);
    $('cancelEditBtn').classList.add('admin-section-hidden');
    refreshTypeFields();
  }
  function loadForEdit(resultId) {
    const r = results.find(x => x.id === resultId); if (!r) return;
    $('editingResultId').value = r.id;
    $('eventSelect').value = r.event_id; $('departmentSelect').value = r.department_code;
    document.querySelector(`input[name="placement"][value="${r.placement}"]`).checked = true;
    $('winnerName').value = r.winner_name || ''; $('teamName').value = r.team_name || '';
    $('teamMembers').value = (r.team_members || []).join('\n'); $('resultNotes').value = r.notes || '';
    $('existingPhotoPath').value = r.image_path || '';
    $('winnerPhoto').value = '';
    $('resultFormTitle').textContent = 'Correct a result'; $('submitResultBtn').textContent = 'SAVE CORRECTION →';
    $('eventSelect').disabled = true;
    document.querySelectorAll('input[name="placement"]').forEach(el => el.disabled = true);
    $('cancelEditBtn').classList.remove('admin-section-hidden');
    refreshTypeFields(); window.scrollTo({top:$('resultForm').getBoundingClientRect().top + window.scrollY - 110, behavior:'smooth'});
  }

  async function uploadPhoto(file, folder) {
    if (!file) return null;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Upload a JPG, PNG or WebP image.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Each image must be 5 MB or smaller.');
    const ext = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const {error} = await db.storage.from('aroha-winner-photos').upload(path, file, {contentType:file.type, upsert:false});
    if (error) throw error;
    return path;
  }

  async function loadData() {
    const [d,e,r,s,g] = await Promise.all([
      db.from('departments').select('code,name,display_order').order('display_order'),
      db.from('events').select('id,title,category,competition_type,event_date,event_time,venue,is_published').order('created_at',{ascending:false}),
      db.from('results').select('id,event_id,department_code,placement,winner_name,team_name,team_members,image_path,notes,created_at,event:events(title,competition_type),department:departments(name)').order('created_at',{ascending:false}),
      db.from('department_scoreboard').select('code,name,display_order,gold,silver,bronze,points'),
      db.from('gallery_items').select('id').eq('is_published',true)
    ]);
    const errors = [d,e,r,s,g].filter(x => x.error);
    if (errors.length) throw errors[0].error;
    departments = d.data || []; events = e.data || []; results = r.data || [];
    populateSelects(); renderScoreboard(s.data || []); renderRecentResults();
    $('statResults').textContent = results.filter(x=>x.is_published !== false).length;
    $('statPhotos').textContent = g.data?.length || 0;
    renderEventManager();
  }
  function renderScoreboard(scores) {
    const sorted = [...scores].sort((a,b)=>Number(b.points)-Number(a.points)||Number(b.gold)-Number(a.gold)||Number(b.silver)-Number(a.silver));
    $('adminScoreList').innerHTML = sorted.map((d,i)=>`<div class="admin-score-line"><span>${i+1}</span><strong>${esc(d.name)}</strong><b>${Number(d.points)||0}</b></div>`).join('');
  }
  function renderRecentResults() {
    $('recentResults').innerHTML = results.length ? results.slice(0,12).map(r => {
      const type = r.event?.competition_type || 'individual';
      const name = type === 'group' ? (r.team_name || 'Team') : (r.winner_name || 'Winner');
      const deleteButton = currentRole === 'admin' ? `<button type="button" class="delete-result" data-delete-result="${esc(r.id)}">DELETE</button>` : '';
      return `<div class="result-item"><div><strong>${esc(name)}</strong><small>${esc(r.event?.title || 'Event')} · ${esc(r.department?.name || r.department_code)} · ${esc(({1:'1st',2:'2nd',3:'3rd'}[r.placement] || ''))} place · ${placePoints(type,Number(r.placement))} points</small><span class="place-tag">${type === 'group' ? 'GROUP' : 'INDIVIDUAL'}</span></div><div class="result-actions"><button type="button" data-share-result="${esc(r.id)}">SHARE POST</button><button type="button" data-edit-result="${esc(r.id)}">CORRECT</button>${deleteButton}</div></div>`;
    }).join('') : '<p class="card-sub">No results have been entered yet. Submit the first official result using the form.</p>';
    document.querySelectorAll('[data-edit-result]').forEach(btn => btn.addEventListener('click',()=>loadForEdit(btn.dataset.editResult)));
    document.querySelectorAll('[data-delete-result]').forEach(btn => btn.addEventListener('click',()=>deleteResult(btn.dataset.deleteResult)));
    document.querySelectorAll('[data-share-result]').forEach(btn => btn.addEventListener('click',()=>createAdminWinnerPost(btn.dataset.shareResult, btn)));
  }

  function adminPosterPhotoUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return db.storage.from('aroha-winner-photos').getPublicUrl(path).data.publicUrl || '';
  }

  function adminPosterText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (ctx.measureText(last + '…').width > maxWidth && last.length > 3) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    lines.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
  }

  async function createAdminWinnerPost(resultId, button) {
    const result = results.find(item => item.id === resultId);
    if (!result) return;
    const original = button.textContent;
    button.disabled = true; button.textContent = 'CREATING…';
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080; canvas.height = 1350;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser cannot create the winner poster.');

      const background = ctx.createLinearGradient(0, 0, 1080, 1350);
      background.addColorStop(0, '#210811'); background.addColorStop(.55, '#451b29'); background.addColorStop(1, '#1d0710');
      ctx.fillStyle = background; ctx.fillRect(0,0,1080,1350);
      ctx.strokeStyle = 'rgba(222,185,112,.38)'; ctx.lineWidth = 2; ctx.strokeRect(34,34,1012,1282);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e9ce91'; ctx.font = '600 29px Georgia,serif'; ctx.fillText('MGCSIILS CHERUVARAKONAM',540,94);
      ctx.fillStyle = '#b9955d'; ctx.font = '700 17px Arial,sans-serif'; ctx.fillText('PRESENTS',540,130);
      ctx.fillStyle = '#f1d99e'; ctx.font = '600 91px Georgia,serif'; ctx.fillText('AROHA ’26',540,226);
      ctx.fillStyle = '#d9c19a'; ctx.font = '600 18px Arial,sans-serif'; ctx.fillText('THE ANNUAL ARTS FESTIVAL',540,270);

      const photoX=112, photoY=315, photoW=856, photoH=510;
      const photoBg=ctx.createLinearGradient(photoX,photoY,photoX+photoW,photoY+photoH);
      photoBg.addColorStop(0,'#e6d0a7'); photoBg.addColorStop(1,'#9c7047');
      ctx.fillStyle=photoBg; ctx.fillRect(photoX,photoY,photoW,photoH);
      const type=result.event?.competition_type || 'individual';
      const person=type==='group' ? (result.team_name || 'Winning team') : (result.winner_name || 'Winner');
      const initials=person.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase() || '?';
      if (result.image_path) {
        try {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.src = adminPosterPhotoUrl(result.image_path);
          await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Photo unavailable'));});
          const scale=Math.max(photoW/image.width,photoH/image.height);
          const sw=photoW/scale, sh=photoH/scale;
          ctx.save(); ctx.beginPath(); ctx.rect(photoX,photoY,photoW,photoH); ctx.clip();
          ctx.drawImage(image,(image.width-sw)/2,(image.height-sh)/2,sw,sh,photoX,photoY,photoW,photoH);
          ctx.restore();
        } catch {
          ctx.fillStyle='#351722'; ctx.font='600 112px Georgia,serif'; ctx.fillText(initials,540,photoY+285);
        }
      } else {
        ctx.fillStyle='#351722'; ctx.font='600 112px Georgia,serif'; ctx.fillText(initials,540,photoY+285);
      }

      const department=result.department?.name || result.department_code || 'Department';
      const eventName=result.event?.title || 'Competition';
      const placement=Number(result.placement);
      const place=({1:'FIRST PLACE',2:'SECOND PLACE',3:'THIRD PLACE'}[placement] || 'WINNER');
      const points=placePoints(type,placement);
      ctx.fillStyle='#e8c77e'; ctx.fillRect(112,856,856,4);
      ctx.fillStyle='#f1d99e'; ctx.font='700 24px Arial,sans-serif'; ctx.fillText(place,540,922);
      ctx.fillStyle='#fff3db'; ctx.font=`600 ${person.length>26?48:person.length>18?58:70}px Georgia,serif`;
      adminPosterText(ctx,person,540,1000,880,75,2);
      ctx.fillStyle='#e0c18b'; ctx.font='700 30px Arial,sans-serif'; ctx.fillText(department.toUpperCase(),540,1100);
      ctx.fillStyle='#e7d6bd'; ctx.font='500 24px Arial,sans-serif'; adminPosterText(ctx,eventName.toUpperCase(),540,1150,870,31,2);
      ctx.fillStyle='#30121b'; ctx.fillRect(390,1210,300,66);
      ctx.fillStyle='#f2d69b'; ctx.font='700 27px Arial,sans-serif'; ctx.fillText(`${points} POINT${points===1?'':'S'} · ${type.toUpperCase()}`,540,1252);
      ctx.fillStyle='#d5bb8e'; ctx.font='600 17px Arial,sans-serif'; ctx.fillText('THE ART OF BEING ALIVE · AROHA ’26',540,1310);

      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('Could not export the winner poster.');
      const safeName=person.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'winner';
      const file=new File([blob],`aroha-26-${safeName}-winner.png`,{type:'image/png'});
      const shareData={files:[file],title:`AROHA ’26 · ${person}`,text:`${place} · ${eventName} · ${department} · AROHA ’26`};
      if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
        await navigator.share(shareData);
        toast('Winner poster shared.');
      } else {
        const url=URL.createObjectURL(blob);
        const link=document.createElement('a');
        link.href=url; link.download=file.name; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),2000);
        toast('Winner poster downloaded as PNG.');
      }
    } catch(error) {
      if(error?.name!=='AbortError') {
        console.error('AROHA winner poster:',error);
        notice('adminAlert',error.message || 'Could not create winner poster.','error');
      }
    } finally {
      button.disabled=false; button.textContent=original;
    }
  }

  async function deleteResult(id) {
    if (currentRole !== 'admin') {
      notice('adminAlert', 'Only the AROHA administrator can delete published results.', 'error');
      return;
    }
    const result = results.find(item => item.id === id);
    if (!result) return;
    const type = result.event?.competition_type || 'individual';
    const name = type === 'group' ? (result.team_name || 'this team') : (result.winner_name || 'this winner');
    const eventName = result.event?.title || 'this event';
    if (!window.confirm(`Permanently delete the result for "${name}" in "${eventName}"? Department scores will be recalculated. This cannot be undone.`)) return;

    try {
      const { error } = await db.from('results').delete().eq('id', id);
      if (error) throw error;
      if (result.image_path) {
        const { error: photoError } = await db.storage.from('aroha-winner-photos').remove([result.image_path]);
        if (photoError) console.warn('Result deleted, but its photo could not be removed:', photoError.message);
      }
      await loadData();
      notice('adminAlert', 'Result deleted. The department scoreboard and public winners list have been recalculated.', 'success');
      toast('Result deleted and scores recalculated.');
    } catch (err) {
      notice('adminAlert', err.message || 'Could not delete this result.', 'error');
    }
  }

  function renderEventManager() {
    const host = $('eventManagerList');
    if (!host) return;
    const ordered = [...events].sort((a,b) => String(a.event_date || '9999-12-31').localeCompare(String(b.event_date || '9999-12-31')) || a.title.localeCompare(b.title));
    host.innerHTML = ordered.length ? ordered.map(event => {
      const linkedResults = results.filter(result => result.event_id === event.id).length;
      const typeLabel = event.competition_type === 'group' ? 'GROUP · 10 / 7 / 2' : event.competition_type === 'individual' ? 'INDIVIDUAL · 5 / 3 / 1' : 'PROGRAMME · NO POINTS';
      const dateLabel = event.event_date ? new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : 'DATE NOT SET';
      return `<article class="event-manager-item">
        <div class="event-manager-main">
          <strong>${esc(event.title)}</strong>
          <small>${esc(event.category)} · ${typeLabel} · ${dateLabel}</small>
          <span>${esc(event.event_time || 'TIME TO BE CONFIRMED')} · ${esc(event.venue || 'VENUE TO BE CONFIRMED')} · ${linkedResults} result(s)</span>
        </div>
        <div class="event-manager-actions">
          <button type="button" data-edit-event="${esc(event.id)}">EDIT</button>
          <button type="button" class="delete-event" data-delete-event="${esc(event.id)}">DELETE</button>
        </div>
      </article>`;
    }).join('') : '<p class="card-sub">No events have been added yet.</p>';
    host.querySelectorAll('[data-edit-event]').forEach(button => button.addEventListener('click', () => loadEventForEdit(button.dataset.editEvent)));
    host.querySelectorAll('[data-delete-event]').forEach(button => button.addEventListener('click', () => deleteEvent(button.dataset.deleteEvent)));
  }

  function resetEventForm() {
    $('eventForm').reset();
    $('editingEventId').value = '';
    $('eventFormHeading').textContent = 'Add a competition / programme';
    $('createEventBtn').textContent = 'ADD EVENT TO PROGRAMME →';
    $('cancelEventEditBtn').classList.add('admin-section-hidden');
  }

  function loadEventForEdit(eventId) {
    if (currentRole !== 'admin') return;
    const event = events.find(item => item.id === eventId);
    if (!event) return;
    $('editingEventId').value = event.id;
    $('newEventTitle').value = event.title || '';
    $('newEventCategory').value = event.category || 'Other';
    $('newEventType').value = event.competition_type || 'individual';
    $('newEventDate').value = event.event_date || '';
    $('newEventTime').value = event.event_time || '';
    $('newEventVenue').value = event.venue || '';
    $('eventFormHeading').textContent = 'Edit event: ' + event.title;
    $('createEventBtn').textContent = 'SAVE EVENT CHANGES →';
    $('cancelEventEditBtn').classList.remove('admin-section-hidden');
    $('eventForm').scrollIntoView({behavior:'smooth',block:'center'});
  }

  async function deleteEvent(eventId) {
    if (currentRole !== 'admin') return;
    const event = events.find(item => item.id === eventId);
    if (!event) return;
    const linkedResults = results.filter(result => result.event_id === eventId);
    const warning = linkedResults.length
      ? ` This event has ${linkedResults.length} result(s). Deleting it will also permanently delete those results, remove their winner entries, and recalculate department scores.`
      : ' No results are currently linked to this event.';
    if (!window.confirm(`Delete the event "${event.title}"?${warning} This action cannot be undone.`)) return;
    try {
      const photoPaths = linkedResults.map(result => result.image_path).filter(Boolean);
      const {error} = await db.from('events').delete().eq('id', eventId);
      if (error) throw error;
      let photoWarning = false;
      if (photoPaths.length) {
        const {error:photoError} = await db.storage.from('aroha-winner-photos').remove(photoPaths);
        photoWarning = Boolean(photoError);
      }
      if ($('editingEventId').value === eventId) resetEventForm();
      await loadData();
      notice('adminAlert', photoWarning
        ? 'Event and linked results deleted; scores recalculated. One or more stored photographs may need manual cleanup.'
        : 'Event deleted. Any linked results were removed and department scores recalculated.', 'success');
      toast('Event deleted.');
    } catch (err) {
      notice('adminAlert', err.message || 'Could not delete this event.', 'error');
    }
  }

  async function checkSession(session) {
    currentUser = session?.user || null;
    if (!currentUser) {
      $('loginView').classList.remove('admin-section-hidden'); $('adminView').classList.add('admin-section-hidden'); $('logoutBtn').classList.add('admin-section-hidden'); $('adminUser').textContent=''; return;
    }
    $('loginView').classList.add('admin-section-hidden'); $('adminView').classList.remove('admin-section-hidden'); $('logoutBtn').classList.remove('admin-section-hidden');
    $('adminUser').textContent = currentUser.email || '';
    const {data:roleRow,error} = await db.from('user_roles').select('role').eq('user_id',currentUser.id).maybeSingle();
    if (error || !roleRow) {
      currentRole = null; $('adminView').classList.add('admin-section-hidden'); $('loginView').classList.remove('admin-section-hidden');
      notice('loginAlert','Your account is signed in but has no AROHA role. Ask the administrator to assign admin or stage_control access.','error');
      await db.auth.signOut(); return;
    }
    currentRole = roleRow.role; $('roleBadge').textContent = currentRole === 'admin' ? 'ADMINISTRATOR' : 'STAGE CONTROL';
    $('eventsTab').classList.toggle('admin-section-hidden', currentRole !== 'admin');
    try { await loadData(); } catch (e) { notice('adminAlert', `Could not load portal data: ${e.message || e}`, 'error'); }
  }

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); if (!db) return;
    hideNotice('loginAlert'); $('loginBtn').disabled = true; $('loginBtn').textContent = 'SIGNING IN…';
    const {data,error} = await db.auth.signInWithPassword({email:$('loginEmail').value.trim(), password:$('loginPassword').value});
    $('loginBtn').disabled = false; $('loginBtn').textContent = 'SIGN IN TO STAGE CONTROL →';
    if (error) { notice('loginAlert', error.message, 'error'); return; }
    await checkSession(data.session);
  });
  $('logoutBtn').addEventListener('click', async () => { await db.auth.signOut(); currentRole = null; currentUser = null; checkSession(null); });
  $('eventSelect').addEventListener('change', refreshTypeFields);
  document.querySelectorAll('input[name="placement"]').forEach(r => r.addEventListener('change',refreshPoints));
  $('cancelEditBtn').addEventListener('click', resetResultForm);

  $('resultForm').addEventListener('submit', async e => {
    e.preventDefault(); if (!roleAllowed()) return;
    const event = activeEvent(); if (!event) { notice('adminAlert','Choose a valid competition first.','error'); return; }
    const place = Number(document.querySelector('input[name="placement"]:checked')?.value || 1);
    const file = $('winnerPhoto').files[0];
    const btn = $('submitResultBtn'); btn.disabled = true; btn.textContent = 'PUBLISHING…'; hideNotice('adminAlert');
    try {
      const photoPath = file ? await uploadPhoto(file,'winners') : null;
      const members = $('teamMembers').value.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean);
      const payload = {
        p_event_id:event.id,
        p_department_code:$('departmentSelect').value,
        p_placement:place,
        p_winner_name:$('winnerName').value.trim() || null,
        p_team_name:$('teamName').value.trim() || null,
        p_team_members:members,
        p_photo_path:photoPath || null,
        p_notes:$('resultNotes').value.trim() || null,
        p_result_id:$('editingResultId').value || null
      };
      if (!payload.p_department_code) throw new Error('Choose the department receiving the points.');
      const {error} = await db.rpc('submit_aroha_result',payload);
      if (error) throw error;
      notice('adminAlert','Result published. The public winners directory and department scoreboard have been updated.','success');
      resetResultForm(); await loadData(); toast('AROHA result published successfully.');
    } catch (err) { notice('adminAlert',err.message || 'Unable to publish this result.','error'); }
    finally { btn.disabled = false; if ($('editingResultId').value) btn.textContent='SAVE CORRECTION →'; else btn.textContent='PUBLISH RESULT →'; }
  });

  $('galleryForm').addEventListener('submit', async e => {
    e.preventDefault(); if (!roleAllowed()) return;
    const file = $('galleryPhoto').files[0]; if (!file) return;
    const btn = $('uploadGalleryBtn'); btn.disabled = true; btn.textContent='UPLOADING…';
    try {
      const path = await uploadPhoto(file,'gallery');
      const {error} = await db.from('gallery_items').insert({caption:$('galleryCaption').value.trim(),image_path:path,is_published:true,created_by:currentUser.id});
      if (error) throw error;
      $('galleryForm').reset(); await loadData(); notice('adminAlert','Photograph added to the public AROHA gallery.','success'); toast('Photo uploaded.');
    } catch (err) { notice('adminAlert',err.message || 'Photo upload failed.','error'); }
    finally { btn.disabled=false; btn.textContent='UPLOAD TO PUBLIC GALLERY →'; }
  });

  $('eventForm').addEventListener('submit', async e => {
    e.preventDefault(); if (currentRole !== 'admin') return;
    const btn = $('createEventBtn');
    const editingId = $('editingEventId').value;
    btn.disabled = true; btn.textContent = editingId ? 'SAVING…' : 'ADDING…';
    try {
      const row = {
        title:$('newEventTitle').value.trim(),
        category:$('newEventCategory').value,
        competition_type:$('newEventType').value,
        event_date:$('newEventDate').value || null,
        event_time:$('newEventTime').value.trim() || null,
        venue:$('newEventVenue').value.trim() || null
      };
      if (editingId) {
        const oldEvent = events.find(item => item.id === editingId);
        const hasResults = results.some(result => result.event_id === editingId);
        if (hasResults && oldEvent && oldEvent.competition_type !== row.competition_type) {
          const proceed = window.confirm('This event already has results. Changing its type will recalculate every linked result using the new scoring rules. Continue?');
          if (!proceed) { btn.disabled = false; btn.textContent = 'SAVE EVENT CHANGES →'; return; }
        }
        const {error} = await db.from('events').update(row).eq('id', editingId);
        if (error) throw error;
        resetEventForm();
        await loadData();
        notice('adminAlert','Event updated. The public programme and result selector have been refreshed.','success');
        toast('Event updated.');
      } else {
        const {error} = await db.from('events').insert({...row,is_published:true,created_by:currentUser.id});
        if (error) throw error;
        resetEventForm();
        await loadData();
        notice('adminAlert','Event added to the public programme and results selector.','success');
        toast('Event created.');
      }
    } catch (err) {
      notice('adminAlert',err.message || 'Could not save this event.','error');
    } finally {
      btn.disabled = false;
      if (!$('editingEventId').value) btn.textContent = 'ADD EVENT TO PROGRAMME →';
    }
  });

  $('cancelEventEditBtn').addEventListener('click', resetEventForm);

  $('adminTabs').addEventListener('click', e => {
    const button = e.target.closest('[data-tab]'); if (!button) return;
    const target = button.dataset.tab;
    if (target === 'eventsPanel' && currentRole !== 'admin') return;
    document.querySelectorAll('#adminTabs button').forEach(b=>b.classList.toggle('active',b===button));
    $('resultsLayout').classList.toggle('admin-section-hidden',target !== 'resultsPanel');
    $('galleryPanel').classList.toggle('admin-section-hidden',target !== 'galleryPanel');
    $('eventsPanel').classList.toggle('admin-section-hidden',target !== 'eventsPanel');
  });

  if (!configured || !db) {
    $('configWarning').classList.remove('admin-section-hidden'); $('loginBtn').disabled = true;
    $('loginEmail').disabled = true; $('loginPassword').disabled = true;
  } else {
    db.auth.getSession().then(({data}) => checkSession(data.session));
    db.auth.onAuthStateChange((_event,session) => { if (!currentUser && session?.user) checkSession(session); else if (!session?.user) checkSession(null); });
  }
})();
