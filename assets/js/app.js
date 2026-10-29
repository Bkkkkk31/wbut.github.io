/* Discover Thailand / Minimalist · Dependency-free event-driven UI.
   Static guide data is sourced unchanged from assets/js/data/provinces.js. */
(() => {
  'use strict';
  const provinces = Array.isArray(window.DiscoverThailandProvinces) ? window.DiscoverThailandProvinces : [];
  const histories = window.DiscoverThailandHistory || {};
  const profiles = window.DiscoverThailandProfiles || {};
  const royalReference = 'https://www.orst.go.th/iwfm_list.asp?i=0040000704004001%2F63EHM5930091';
  const sealReference = 'https://www.nat.go.th/';
  const regions = ['ทั้งหมด', 'ภาคเหนือ', 'ภาคใต้', 'ภาคกลาง', 'ภาคตะวันตก', 'ภาคตะวันออก', 'ภาคอีสาน'];
  const categories = [
    { id: 'all', name: 'ทั้งหมด' }, { id: 'nature', name: 'ธรรมชาติ' },
    { id: 'culture', name: 'วัฒนธรรมและวัด' }, { id: 'cafe', name: 'คาเฟ่และไลฟ์สไตล์' },
    { id: 'unseen', name: 'Unseen Thailand' }
  ];
  const state = { provinceId: 'chiangmai', region: 'ทั้งหมด', tab: 'attractions', category: 'all', query: '', profileSection: 'summary', mapOpen: false, favorites: [], theme: 'dark', selectedItem: null, activeOverlay: null, previousFocus: null };
  const $ = (id) => document.getElementById(id);
  const esc = (str) => String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const safeURL = (str) => { try { const u = new URL(str); return /^https?:$/.test(u.protocol) ? u.href : '#'; } catch (_) { return '#'; } };
  const icon = (name, cls='') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key,value) { try { localStorage.setItem(key,value); } catch (_) {} },
    remove(key) { try { localStorage.removeItem(key); } catch (_) {} }
  };
  const pCurrent = () => provinces.find(p => p.id === state.provinceId) || provinces[0];
  const isFav = (id) => state.favorites.includes(id);
  const mapsSearchFor = (item) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((item.title || item.name || '') + ', ' + (item.provinceName || '') + ', ประเทศไทย')}`;
  const findItem = (id) => { for (const province of provinces) { const match = [...province.attractions, ...province.foods].find(x => x.id === id); if (match) return { ...match, provinceId: province.id, provinceName: province.nameTh, isFood: province.foods.some(x => x.id === id) }; } return null; };
  const isReducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const categoryName = (category) => categories.find(c => c.id === category)?.name || 'สถานที่ท่องเที่ยว';
  const isSearch = () => state.query.trim().length > 0;
  const queryText = () => state.query.trim().toLocaleLowerCase('th');
  const availableProvinces = () => provinces.filter(p => state.region === 'ทั้งหมด' || p.region === state.region);

  function init() {
    if (!provinces.length) { $('contentView').textContent = 'ไม่สามารถโหลดข้อมูลจังหวัดได้ กรุณาตรวจสอบไฟล์ assets/js/data/provinces.js'; return; }
    if (!provinces.some(p => p.id === state.provinceId)) state.provinceId = provinces[0].id;
    state.theme = store.get('th_minimal_theme') === 'light' ? 'light' : 'dark';
    let saved = [];
    try { saved = JSON.parse(store.get('th_travel_favs') || '[]'); } catch (_) {}
    const ids = Array.isArray(saved) ? saved.map(x => typeof x === 'string' ? x : x?.id) : [];
    // Add verified-by-name supplementary attractions and regional dishes without changing original records.
    for (const p of provinces) {
      const extra = profiles[p.id];
      if (!extra) continue;
      const knownPlaces = new Set(p.attractions.map(a => a.title));
      extra.places.forEach((x,i) => {
        if (knownPlaces.has(x[0])) return;
        p.attractions.push({id:`more_${p.id}_place_${i}`,title:x[0],category:x[2]==='ธรรมชาติ'||x[2]==='ทะเล'?'nature':x[2]==='วัฒนธรรม'||x[2]==='ประวัติศาสตร์'?'culture':'unseen',location:x[3]?`อ.${x[3]}`:p.nameTh,shortDesc:x[1],fullDesc:x[1],image:null,rating:null,reviews:null,hours:'',fee:''});
      });
      const knownFoods=new Set(p.foods.map(a=>a.name));
      extra.foods.forEach((x,i)=>{
        if(knownFoods.has(x[0])) return;
        p.foods.push({id:`more_${p.id}_food_${i}`,name:x[0],description:x[1],tasteProfile:'อาหารพื้นถิ่น',recommendedSpot:'สำรวจร้านท้องถิ่นในจังหวัด',image:null});
      });
    }
    // Validate favorites after supplementary items are added, otherwise IDs
    // of those items are silently lost on reload.
    state.favorites = [...new Set(ids)].filter(id => typeof id === 'string' && !!findItem(id));
    applyTheme();
    setScale();
    // All original data and filter behavior are preserved; only presentation was rewritten.
    $('provinceSelect').innerHTML = provinces.map(p => `<option value="${esc(p.id)}">${esc(p.nameTh)} — ${esc(p.region)}</option>`).join('');
    bindEvents();
    renderAll();
    const url = new URL(window.location.href);
    const initialProvince = url.searchParams.get('province');
    const initialTab = url.searchParams.get('tab');
    const initialPlace = url.searchParams.get('place');
    if (initialProvince && provinces.some(p => p.id===initialProvince)) selectProvince(initialProvince,false);
    if (initialTab) selectTab(initialTab);
    if (initialPlace && findItem(initialPlace) && !findItem(initialPlace).isFood) openDetail(initialPlace);
    window.addEventListener('resize', setScale, { passive:true });
  }

  // Baseline 1920x1080. Desktop spacing scales by resolution while mobile uses a readable adaptive layout.
  function setScale() {
    const desktop = window.innerWidth >= 1040;
    const base = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    const factor = desktop ? Math.min(1, Math.max(.82, base)) : 1;
    document.documentElement.style.setProperty('--ui-scale', factor.toFixed(3));
  }

  function applyTheme() {
    document.body.dataset.theme = state.theme;
    document.documentElement.style.colorScheme = state.theme;
    const button = $('themeToggle');
    button.innerHTML = icon(state.theme === 'dark' ? 'sun' : 'moon');
    button.title = state.theme === 'dark' ? 'เปิดโหมดสว่าง' : 'เปิดโหมดมืด';
    button.setAttribute('aria-label', button.title);
  }

  function renderAll() { renderNav(); renderHero(); renderTabs(); renderContent(); updateFavoriteCount(); }
  function renderNav() {
    $('provinceSelect').value = state.provinceId;
    $('regionTabs').innerHTML = regions.map(region => `<button type="button" class="region-button ${state.region === region ? 'active' : ''}" data-region="${esc(region)}" aria-pressed="${state.region === region}">${esc(region)}</button>`).join('');
    const visibleProvinces = availableProvinces();
    $('provincePills').innerHTML = visibleProvinces.map(p => `<button type="button" class="province-pill ${p.id === state.provinceId ? 'active' : ''}" data-province="${esc(p.id)}" aria-pressed="${p.id === state.provinceId}">${esc(p.nameTh)}</button>`).join('');
    const selectedNumber = visibleProvinces.findIndex(p => p.id === state.provinceId) + 1;
    $('provinceCount').textContent = state.region === 'ทั้งหมด'
      ? `ทั้งหมด ${provinces.length} จังหวัด`
      : `แสดง ${visibleProvinces.length}/${provinces.length} จังหวัด`;
    $('provincePosition').textContent = `ลำดับ ${selectedNumber}/${visibleProvinces.length}`;
    $('provincePrev').disabled = visibleProvinces.length <= 1;
    $('provinceNext').disabled = visibleProvinces.length <= 1;
  }
  function renderHero() {
    const p = pCurrent();
    $('heroMedia').style.backgroundImage = `url("${safeURL(p.heroImage).replace(/"/g,'')}")`;
    $('heroRegion').textContent = p.region;
    $('heroTitle').textContent = p.nameTh;
    $('heroEnglish').textContent = p.nameEn;
    $('heroSlogan').textContent = p.slogan;
    $('heroTags').innerHTML = p.tags.map(t => `<span class="hero-tag">${esc(t)}</span>`).join('');
    window.ThaiProvinceAtlasLive?.selectProvince(p.id);
    $('heroSeason').textContent = p.weather.bestSeason;
    $('heroTransport').textContent = p.weather.transport;
    $('heroTat').href = safeURL(p.tatUrl);
    $('heroMaps').href = safeURL(p.mapsUrl);
    $('heroOfficial').href = safeURL(p.officialUrl);
    $('contextLabel').textContent = `${p.nameTh} • ${p.region}`;
  }
  function renderTabs() {
    $('tabs').querySelectorAll('[data-tab]').forEach(b => {
      const active = b.dataset.tab === state.tab;
      b.classList.toggle('active',active);
      b.setAttribute('aria-selected',String(active));
      b.tabIndex = active ? 0 : -1;
    });
  }
  function currentCandidates(type) {
    const q = queryText();
    const sources = q ? availableProvinces() : [pCurrent()];
    return sources.flatMap(p => p[type].map(item => ({ ...item, provinceId: p.id, provinceName: p.nameTh, provinceNameEn: p.nameEn, isFood: type === 'foods' })))
      .filter(item => {
        if (type === 'attractions' && state.category !== 'all' && item.category !== state.category) return false;
        if (!q) return true;
        const haystack = type === 'foods'
          ? [item.name, item.description, item.recommendedSpot, item.tasteProfile, item.provinceName, item.provinceNameEn]
          : [item.title, item.shortDesc, item.fullDesc, item.location, item.provinceName, item.provinceNameEn, categoryName(item.category)];
        return haystack.some(value => String(value || '').toLocaleLowerCase('th').includes(q));
      });
  }
  function renderContent() {
    const showFilters = state.tab === 'attractions';
    $('filters').hidden = !showFilters;
    const notice = $('searchNotice');
    notice.hidden = !isSearch() || (state.tab !== 'attractions' && state.tab !== 'foods');
    if (!notice.hidden) notice.innerHTML = `<span>ผลการค้นหา: <strong>${esc(state.query)}</strong>${state.region !== 'ทั้งหมด' ? ` · ${esc(state.region)}` : ''}</span><button type="button" id="clearSearch">ล้างคำค้นหา</button>`;
    $('categoryFilters').innerHTML = categories.map(c => `<button class="category-filter ${state.category === c.id ? 'active' : ''}" type="button" data-category="${esc(c.id)}" aria-pressed="${state.category === c.id}">${esc(c.name)}</button>`).join('');
    $('contentView').style.animation = 'none';
    // Reset CSS animation only when the user explicitly changes tab/province, not in a render loop.
    void $('contentView').offsetWidth;
    $('contentView').style.animation = '';
    if (state.tab === 'attractions' || state.tab === 'foods') {
      const type = state.tab;
      const items = currentCandidates(type);
      $('resultsCount').textContent = `พบ ${items.length} รายการ`;
      const content = items.length ? `<div class="result-grid ${items.length === 1 ? 'one-result' : ''}">${items.map(type === 'foods' ? foodCard : placeCard).join('')}</div>` : emptyState();
      $('contentView').innerHTML = `<div class="content-layout"><div>${content}</div>${renderSidebar()}</div>`;
    } else if (state.tab === 'itinerary') {
      $('contentView').innerHTML = renderItinerary();
    } else if (['map_explore','trip_planner','forecast','all_provinces'].includes(state.tab)) {
      window.DiscoverThailandExtras?.render(state.tab, pCurrent(), provinces);
    } else if (state.tab === 'history') {
      $('contentView').innerHTML = renderHistory();
    } else if (state.tab === 'profile') {
      $('contentView').innerHTML = renderProvinceProfile();
    } else {
      $('contentView').innerHTML = renderTips();
    }
  }
  function favoriteButton(item) {
    const selected = isFav(item.id);
    return `<button class="favorite-card-button ${selected ? 'active' : ''}" type="button" data-favorite="${esc(item.id)}" aria-label="${selected ? 'นำออกจาก' : 'เพิ่มใน'}รายการโปรด: ${esc(item.title || item.name)}" aria-pressed="${selected}" title="รายการโปรด">${icon('heart')}</button>`;
  }
  function placeCard(item) {
    return `<article class="result-card"><div class="result-photo">${item.image ? `<img src="${esc(safeURL(item.image))}" alt="${esc(item.title)}" loading="lazy" decoding="async">` : `<div class="photo-placeholder"><img class="photo-placeholder-map" src="assets/img/map-brand.png" alt="ภาพสัญลักษณ์แผนที่" loading="lazy"><span>${esc(item.provinceName)}</span></div>`}<span class="card-chip">${esc(categoryName(item.category))}</span>${favoriteButton(item)}${item.rating != null ? `<span class="rating-chip" title="คะแนนและรีวิวจากข้อมูลตัวอย่าง">${icon('star')}${esc(item.rating)}<span class="rating-reviews">(${esc(item.reviews ?? '–')})</span></span>` : ''}</div><div class="card-body"><h3>${esc(item.title)}</h3><div class="card-location">${icon('pin')}${esc(isSearch() ? item.provinceName + ' • ' + item.location : item.location)}</div><p class="card-text">${esc(item.shortDesc)}</p><div class="card-footer"><button class="text-action" type="button" data-detail="${esc(item.id)}">ดูรายละเอียด ${icon('arrow')}</button><button class="mini-action" type="button" data-plan-add="${esc(item.id)}">${icon('route')} เพิ่มในทริป</button></div></div></article>`;
  }
  function foodCard(item) {
    return `<article class="result-card"><div class="result-photo">${item.image ? `<img src="${esc(safeURL(item.image))}" alt="${esc(item.name)}" loading="lazy" decoding="async">` : `<div class="photo-placeholder">${icon('food')}<span>${esc(item.provinceName)}</span></div>`}<span class="card-chip">อาหารท้องถิ่น</span>${favoriteButton(item)}</div><div class="card-body"><h3>${esc(item.name)}</h3><div class="card-location">${icon('pin')}${esc(item.provinceName)}</div><p class="card-text">${esc(item.description)}</p><div class="mini-label">ข้อมูลเพิ่มเติม</div><p class="card-spot">${esc(item.tasteProfile)}</p>${item.recommendedSpot && !String(item.id).startsWith('more_')?`<div class="card-subtitle">ร้านแนะนำ</div><p class="card-spot">${esc(item.recommendedSpot)}</p>`:''}</div></article>`;
  }
  function renderSidebar() {
    const p = pCurrent();
    return `<aside class="side-panel"><p class="section-overline">QUICK GUIDE</p><h3>ก่อนเดินทางไป${esc(p.nameTh)}</h3><p>${esc(p.tips.bestTime)}</p><div class="side-details"><div class="side-detail">${icon('calendar')}<span>ฤดูกาลที่เหมาะสม<br><strong>${esc(p.weather.bestSeason)}</strong></span></div><div class="side-detail">${icon('car')}<span>${esc(p.weather.transport)}</span></div><div class="side-detail">${icon('info')}<span>${esc(p.tips.advices?.[0] || 'ตรวจสอบข้อมูลก่อนออกเดินทาง')}</span></div><div class="side-detail">${icon('external')}<a target="_blank" rel="noopener noreferrer" href="${esc(safeURL(p.officialUrl))}">ข้อมูลจากเว็บไซต์จังหวัด</a></div></div></aside>`;
  }
  function emptyState() {
    return `<div class="empty-state">${icon('search')}<h3>ไม่พบข้อมูลที่ตรงกับการค้นหา</h3><p>ลองเลือกหมวดหมู่หรือใช้คำค้นหาอื่น</p><button type="button" class="btn btn-secondary" id="resetFilters">ล้างตัวกรอง</button></div>`;
  }
  function renderItinerary() {
    const plan = pCurrent().itinerary;
    const m = String(plan.title || '').match(/(?:ทริป|trip)\s*(\d+)\s*วัน/i);
    const incomplete = !!m && plan.days.length < Number(m[1]);
    return `<div class="itinerary-intro"><p class="section-overline">SUGGESTED ITINERARY</p><h3>${esc(plan.title)}</h3><p>${esc(plan.subtitle)}</p></div><div class="timeline">${plan.days.map((d,i) => `<section class="timeline-day"><p class="section-overline">DAY ${i+1}</p><h4>${esc(d.title)}</h4>${d.schedules.map(s => `<div class="schedule"><time>${esc(s.time)}</time><div><strong>${esc(s.activity)}</strong><p>${esc(s.detail)}</p></div></div>`).join('')}</section>`).join('')}</div>${incomplete ? '<p class="info-note">แผนนี้ยังเป็นตัวอย่างบางส่วนของทริป ไม่ใช่กำหนดการครบทุกวัน ควรวางแผนเพิ่มเติมก่อนเดินทาง</p>' : ''}`;
  }
  function renderTips() {
    const p=pCurrent(), t=p.tips;
    return `<div class="tips-grid"><section class="tip-card"><h3 class="tip-card-title">${icon('route')}วิธีเดินทาง</h3><div class="tip-line"><small>รถยนต์ส่วนตัว</small><p>${esc(t.byCar)}</p></div><div class="tip-line"><small>รถโดยสาร / รถไฟ / เครื่องบิน</small><p>${esc(t.byPublic)}</p></div><div class="tip-line"><small>เดินทางภายในจังหวัด</small><p>${esc(t.localTransport)}</p></div></section><section class="tip-card"><h3 class="tip-card-title">${icon('calendar')}ช่วงเวลาที่เหมาะสม</h3><div class="tip-line"><small>ฤดูกาลแนะนำ</small><p>${esc(t.bestTime)}</p></div><div class="tip-line"><small>คำแนะนำเพิ่มเติม</small><ul class="tip-list">${t.advices.map(a=>`<li>${esc(a)}</li>`).join('')}</ul></div></section><section class="tip-card"><h3 class="tip-card-title">${icon('building')}เว็บไซต์ทางการ</h3><a class="official-link" target="_blank" rel="noopener noreferrer" href="${esc(safeURL(p.officialUrl))}"><span>เว็บไซต์จังหวัด${esc(p.nameTh)}</span>${icon('external')}</a><a class="official-link" target="_blank" rel="noopener noreferrer" href="${esc(safeURL(p.tatUrl))}"><span>การท่องเที่ยวแห่งประเทศไทย</span>${icon('external')}</a><a class="official-link" target="_blank" rel="noopener noreferrer" href="${esc(safeURL(p.mapsUrl))}"><span>Google Maps</span>${icon('external')}</a><p class="info-note">ตรวจสอบการเดินทาง เวลาให้บริการ และราคาจากเว็บไซต์ทางการก่อนเดินทาง</p></section></div>`;
  }


  function renderHistory() {
    const p = pCurrent();
    const history = histories[p.id];
    if (!history) return `<div class="empty-state">${icon('info')}<h3>ยังไม่มีประวัติจังหวัดนี้</h3></div>`;
    const periods = Array.isArray(history.periods) ? history.periods : [];
    const sources = Array.isArray(history.sources) ? history.sources : [];
    return `<article class="history-page" aria-labelledby="historyHeading">
      <div class="history-heading"><div class="history-kicker">${icon('book')} <span>PROVINCIAL HISTORY / เรื่องราวเมืองไทย</span></div>
        <h3 id="historyHeading">ประวัติความเป็นมาจังหวัด${esc(p.nameTh.replace(/ \(.*$/,''))}</h3>
        <p class="history-intro">${esc(history.intro)}</p></div>
      <div class="history-layout"><section class="history-main" aria-label="ลำดับเหตุการณ์สำคัญ">
        <div class="history-section-label"><span class="history-index">01</span><div><h4>ลำดับเหตุการณ์สำคัญ</h4><p>พัฒนาการของจังหวัดจากอดีตสู่ปัจจุบัน</p></div></div>
        <div class="history-events">${periods.map((item, i) => `<div class="history-event"><div class="history-marker" aria-hidden="true"></div><div class="history-period">${esc(item[0])}</div><h5>${esc(item[1])}</h5><p>${esc(item[2])}</p></div>`).join('')}</div>
      </section><aside class="history-side" aria-label="มรดกและเอกสารอ้างอิง">
        <section class="history-side-card"><div class="history-side-label">${icon('building')} <span>มรดกและอัตลักษณ์ท้องถิ่น</span></div><p>${esc(history.identity)}</p></section>
        <section class="history-side-card"><div class="history-side-label">${icon('external')} <span>แหล่งข้อมูลและศึกษาเพิ่มเติม</span></div>
          <p class="history-source-hint">สรุปเรียบเรียงใหม่เพื่อการเรียนรู้ สามารถเปิดอ่านเนื้อหาต้นทางจากแหล่งข้อมูลต่อไปนี้</p>
          <div class="history-source-list">${sources.map(src => `<a href="${esc(safeURL(src[1]))}" target="_blank" rel="noopener noreferrer">${esc(src[0])}${icon('external')}</a>`).join('')}</div></section>
        <div class="history-next"><span>สำรวจข้อมูลเพิ่มเติม</span><button type="button" data-history-to="attractions">${icon('pin')} สถานที่ท่องเที่ยว</button><button type="button" data-history-to="travel_tips">${icon('route')} การเดินทาง</button></div>
      </aside></div>
      <p class="history-disclaimer">หมายเหตุ: ช่วงเวลาและรายละเอียดบางเหตุการณ์เรียบเรียงสรุปจากหลักฐานและเอกสารท้องถิ่น หากนำไปใช้อ้างอิงทางวิชาการควรตรวจสอบเอกสารต้นทางเพิ่มเติม</p>
    </article>`;
  }


  // Directory sections follow the province-info template but keep the existing design and scale.
  const profileSections = [
    ['summary','ภาพรวมจังหวัด','info'],['history','ประวัติ','history'],['motto','คำขวัญ','book'],
    ['food','อาหาร','food'],['song','เพลงประจำจังหวัด','info'],['flag','ธงประจำจังหวัด','map'],
    ['flower','ดอกไม้ประจำจังหวัด','info'],['tree','ต้นไม้ประจำจังหวัด','info'],
    ['general','ข้อมูลทั่วไป','building'],['seal','ตราสัญลักษณ์','star'],
    ['places','สถานที่ท่องเที่ยว','pin'],['map','แผนที่จังหวัด','map'],
    ['administration','ผู้บริหารจังหวัด','building'],['districts','ข้อมูลอำเภอ / เขต','route'],
    ['souvenirs','ของฝากประจำจังหวัด','heart'],['brief','บรรยายสรุปจังหวัด','book'],
    ['links','เว็บไซต์ที่เกี่ยวข้อง','external'],['credits','ผู้จัดทำและข้อมูล','info']
  ];
  const profileNote = '<p class="profile-help">ข้อมูลเพื่อการศึกษาและวางแผนท่องเที่ยว ไม่ใช่เอกสารราชการฉบับปัจจุบัน โปรดดูแหล่งข้อมูลต้นทางเมื่อใช้อ้างอิง</p>';
  const sourceLink = (href, title) => `<a class="profile-source" target="_blank" rel="noopener noreferrer" href="${esc(safeURL(href))}">${icon('external')}${esc(title)}</a>`;
  const tile = (label,value,hint='') => `<div class="profile-fact"><span>${esc(label)}</span><strong>${esc(value)}</strong>${hint?`<small>${esc(hint)}</small>`:''}</div>`;
  function renderProvinceProfile(){
    const p=pCurrent(), d=profiles[p.id];
    if(!d) return '<div class="empty-state"><h3>ยังไม่มีข้อมูลจังหวัดนี้</h3></div>';
    const active=profileSections.find(x=>x[0]===state.profileSection)||profileSections[0];
    return `<div class="profile-page">
      <header class="profile-heading"><div><p class="section-overline">PROVINCIAL DIRECTORY • คู่มือข้อมูลจังหวัด</p><h3>สารานุกรมจังหวัด${esc(p.nameTh.replace(/ \(.*$/,''))}</h3><p>ค้นคว้าได้ ${profileSections.length} หมวด • ประวัติ วัฒนธรรม สัญลักษณ์และข้อมูลท้องถิ่น</p></div><span class="profile-region">${esc(p.region)}</span></header>
      <div class="profile-layout"><nav class="profile-menu" aria-label="หมวดข้อมูลประจำจังหวัด"><div class="profile-menu-heading">เลือกหัวข้อข้อมูล</div><div class="profile-menu-list">${profileSections.map(([id,name,ic])=>`<button type="button" data-profile-section="${id}" class="profile-menu-button ${state.profileSection===id?'active':''}" aria-current="${state.profileSection===id?'page':'false'}">${icon(ic)}<span>${esc(name)}</span>${icon('right','profile-chevron')}</button>`).join('')}</div></nav>
      <article class="profile-detail" aria-labelledby="profileTitle"><div class="profile-detail-head"><span class="profile-section-counter">${String(profileSections.findIndex(x=>x[0]===active[0])+1).padStart(2,'0')} / ${profileSections.length}</span><h4 id="profileTitle">${esc(active[1])}</h4></div>${profilePanel(p,d)}${profileNote}</article></div>
    </div>`;
  }
  function profilePanel(p,d){
    const name=p.nameTh.replace(/ \(.*$/,'');
    const maplink=(location)=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location+' ประเทศไทย')}`;
    const bullets=(arr)=>`<ul class="profile-bullets">${arr.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
    const cards=(items,second='')=>`<div class="profile-card-grid">${items.map((item)=>`<div class="profile-item"><h5>${esc(item[0])}</h5><p>${esc(item[1])}</p>${second==='places'?sourceLink(maplink(item[0]+' '+name),'ดูพิกัดใน Google Maps'):''}</div>`).join('')}</div>`;
    const source=sourceLink(p.officialUrl,`เว็บไซต์จังหวัด${name}`);
    switch (state.profileSection){
      case 'summary': return `<p class="profile-lead">${esc(histories[p.id]?.intro||d.geography)}</p><div class="profile-facts">${tile('ภูมิภาค',p.region)}${tile('ต้นไม้ประจำจังหวัด',d.tree,'ราชบัณฑิตยสภา')}${tile('ดอกไม้ประจำจังหวัด',d.flower||'รอข้อมูลที่ยืนยันได้',d.flower?'เอกสารหน่วยงานจังหวัด':'ตรวจสอบกับจังหวัด')}</div><section class="profile-subsection"><h5>ภาพรวมพื้นที่</h5><p>${esc(d.geography)}</p><h5>วัฒนธรรมและผู้คน</h5><p>${esc(d.culture)}</p><h5>กิจกรรมทางเศรษฐกิจ</h5><p>${esc(d.economy)}</p></section><div class="profile-actions"><button class="btn btn-primary" type="button" data-profile-section="history">${icon('history')} อ่านประวัติจังหวัด</button><button class="btn" type="button" data-profile-section="places">${icon('pin')} สำรวจสถานที่</button></div>`;
      case 'history': return renderHistory();
      case 'motto': return `<blockquote class="profile-quote">${esc(d.motto)}</blockquote><p class="profile-explain">คำขวัญสะท้อนลักษณะเด่นของพื้นที่ ทั้งภูมิประเทศ ประวัติศาสตร์ ศิลปวัฒนธรรม และสิ่งที่ชาวจังหวัดภาคภูมิใจ ข้อความนี้อ้างอิงชุดข้อมูลสำนักงานราชบัณฑิตยสภา (ปรับปรุง พ.ศ. 2566)</p>${sourceLink(royalReference,'ตรวจสอบคำขวัญและต้นไม้ประจำจังหวัด — สำนักงานราชบัณฑิตยสภา')}`;
      case 'food': return `<p class="profile-lead">อาหารท้องถิ่นสะท้อนวิถีชุมชน วัตถุดิบ และวัฒนธรรมการกินของจังหวัด${esc(name)}</p>${cards(d.foods)}<div class="profile-actions"><button class="btn" type="button" data-history-to="foods">${icon('food')} เปิดแกลเลอรี่อาหารทั้งหมด</button></div>`;
      case 'song': return `<div class="profile-status">${icon('info')}<div><strong>${d.songTitles?'เพลงเกี่ยวกับจังหวัดจากเว็บไซต์จังหวัด':'เพลงประจำจังหวัด'}</strong><p>${d.songTitles?'ชื่อเพลงเหล่านี้ระบุอยู่ในหน้ารวบรวมเพลงของจังหวัด ไม่ได้หมายความว่าทุกเพลงมีสถานะเป็นเพลงประจำจังหวัดอย่างเป็นทางการ':'เพลงที่ใช้เรียกกันในท้องถิ่นกับเพลงที่ได้รับการรับรองอย่างเป็นทางการอาจไม่ใช่เพลงเดียวกัน ขณะนี้ยังไม่มีไฟล์เพลงหรือชื่อเพลงที่ตรวจสอบสถานะและสิทธิ์การเผยแพร่ได้สำหรับจังหวัดนี้ จึงไม่ใส่ชื่อเพลงหรือไฟล์เสียงโดยคาดเดา'}</p></div></div>${d.songTitles?bullets(d.songTitles):''}<div class="profile-actions">${d.songSource?sourceLink(d.songSource,'ข้อมูลเพลงบนเว็บไซต์จังหวัด'):source}</div>`;
      case 'flag': return `<div class="profile-facts">${tile('ธงประจำจังหวัด',d.flag||'ตรวจสอบจากเว็บไซต์จังหวัด')}</div><p class="profile-explain">${d.flag?'คำบรรยายลักษณะธงอ้างอิงจากข้อมูลของหน่วยงานจังหวัด โดยยังไม่แสดงภาพวาดจำลองเพื่อป้องกันการใช้รูปแบบธงผิด':'ธงประจำจังหวัดต้องใช้สี รูปตรา และสัดส่วนตามข้อมูลทางการ จึงไม่สร้างธงจำลองจากการคาดเดา'}</p>${sourceLink(d.flagSource||p.officialUrl,'เปิดข้อมูลธงและเครื่องหมายประจำจังหวัด')}`;
      case 'flower': return `<div class="profile-facts">${tile('ดอกไม้ประจำจังหวัด',d.flower||'รอตรวจสอบแหล่งทางการ')}</div><p class="profile-explain">${d.flower?`ดอก${esc(d.flower)}เป็นดอกไม้ประจำจังหวัดที่ระบุในแหล่งข้อมูลหน่วยงานภาครัฐหรือจังหวัด`: 'ยังไม่มีแหล่งทางการที่ตรวจสอบยืนยันชนิดดอกไม้สำหรับรายการนี้ จึงไม่ระบุชื่อที่อาจคลาดเคลื่อน'}</p>${sourceLink(d.flowerSource||p.officialUrl,d.flower?'แหล่งอ้างอิงดอกไม้ประจำจังหวัด':'ตรวจสอบข้อมูลดอกไม้กับเว็บไซต์จังหวัด')}`;
      case 'tree': return `<div class="profile-facts">${tile('ต้นไม้ประจำจังหวัด',d.tree,'อ้างอิงสำนักงานราชบัณฑิตยสภา')}</div><p class="profile-explain">ข้อมูลต้นไม้ประจำจังหวัดเป็นข้อมูลเชิงอัตลักษณ์ ไม่ใช่ข้อมูลพื้นที่ป่าไม้หรือจำนวนต้นไม้ในปัจจุบัน</p>${sourceLink(royalReference,'สำนักงานราชบัณฑิตยสภา — คำขวัญและต้นไม้ประจำจังหวัด')}`;
      case 'general': return `<div class="profile-facts">${tile('ชื่อจังหวัด',name)}${tile('ภูมิภาค',p.region)}${tile('ภาษาอังกฤษ',p.nameEn)}</div><div class="profile-subsection"><h5>ภูมิศาสตร์และการตั้งถิ่นฐาน</h5><p>${esc(d.geography)}</p><h5>สังคมและวัฒนธรรม</h5><p>${esc(d.culture)}</p><h5>ภาพรวมเศรษฐกิจ</h5><p>${esc(d.economy)}</p></div>${source}`;
      case 'seal': return `<div class="profile-status">${icon('star')}<div><strong>ตราสัญลักษณ์ประจำจังหวัด</strong><p>${esc(d.seal||'จังหวัดต่าง ๆ มีตราสัญลักษณ์ที่อ้างอิงประวัติศาสตร์ ศาสนสถาน ภูมิประเทศ หรือวิถีชุมชน สำหรับจังหวัดนี้โปรดดูคำอธิบายและภาพตราฉบับจริงจากหน่วยงานจังหวัด')}</p></div></div>${sourceLink(d.sealSource||p.officialUrl,'ตรวจสอบตราจังหวัดฉบับทางการ')}<p class="profile-explain">อ่านความเป็นมาของการจัดทำตราประจำจังหวัดได้จากหอจดหมายเหตุแห่งชาติด้วย</p>${sourceLink(sealReference,'หอจดหมายเหตุแห่งชาติ')}`;
      case 'places': return `<p class="profile-lead">สถานที่สำคัญที่ช่วยให้รู้จักธรรมชาติ ประวัติศาสตร์ และวิถีชีวิตในจังหวัด${esc(name)} มากขึ้น</p>${cards(d.places,'places')}<div class="profile-actions"><button class="btn" type="button" data-history-to="attractions">${icon('pin')} ดูรายละเอียดสถานที่ทั้งหมด</button></div>`;
      case 'map': return `<p class="profile-lead">ดูแผนที่จังหวัด${esc(name)} และค้นหาสถานที่สำคัญภายในจังหวัด</p><div class="profile-map-actions"><a class="btn btn-primary" href="${esc(safeURL(p.mapsUrl))}" target="_blank" rel="noopener noreferrer">${icon('map')} เปิด Google Maps ${icon('external')}</a><button class="btn" type="button" data-map-toggle>${icon('map')}${state.mapOpen?'ซ่อนแผนที่ในหน้า':'แสดงแผนที่ในหน้า'}</button></div>${state.mapOpen?`<iframe class="profile-map-frame" title="แผนที่จังหวัด${esc(name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent(name+' Thailand')}&z=9&output=embed"></iframe>`:''}<p class="profile-explain">แผนที่โหลดจาก Google เฉพาะเมื่อกดแสดง ต้องเชื่อมต่ออินเทอร์เน็ต หากแผนที่ไม่ปรากฏให้เปิดผ่านปุ่ม Google Maps</p>`;
      case 'administration': return `<div class="profile-status">${icon('building')}<div><strong>ผู้บริหารจังหวัด${esc(name)}</strong><p>รายชื่อผู้ว่าราชการจังหวัดและรองผู้ว่าราชการจังหวัดอาจเปลี่ยนแปลงได้ตามคำสั่งแต่งตั้ง จึงไม่แสดงรายชื่อที่อาจล้าสมัยในเว็บแบบไฟล์นิ่ง</p></div></div><div class="profile-actions">${source}</div>${name==='กรุงเทพมหานคร'?'<p class="profile-explain">หมายเหตุ: กรุงเทพมหานครเป็นองค์กรปกครองส่วนท้องถิ่นรูปแบบพิเศษ มีผู้ว่าราชการกรุงเทพมหานคร ไม่ใช่ผู้ว่าราชการจังหวัดในระบบส่วนภูมิภาค</p>':''}`;
      case 'districts': return `<p class="profile-lead">ตัวอย่าง${p.id==='bangkok'?'เขต':'อำเภอ'}สำคัญใน${esc(name)} เพื่อช่วยวางแผนการศึกษาและท่องเที่ยว</p><div class="profile-districts">${d.districts.map((it,i)=>`<a href="${esc(maplink(it+' '+name))}" target="_blank" rel="noopener noreferrer"><span>${String(i+1).padStart(2,'0')}</span>${esc(p.id==='bangkok'?'เขต':'อำเภอ')}${esc(it)}${icon('external')}</a>`).join('')}</div><p class="profile-explain">รายการข้างต้นเป็นเพียงตัวอย่าง ไม่ใช่ทะเบียนรายชื่อครบทุกอำเภอ${p.id==='bangkok'?' (กรุงเทพมหานครแบ่งเป็นเขต)':''} ตรวจสอบจำนวนและเขตปกครองล่าสุดกับหน่วยงานราชการ</p>${source}`;
      case 'souvenirs': return `<p class="profile-lead">ตัวอย่างของฝากและผลิตภัณฑ์ท้องถิ่นที่พบในจังหวัด${esc(name)} ร้านจำหน่ายและแหล่งผลิตอาจเปลี่ยนตามช่วงเวลา</p>${bullets(d.souvenirs)}<div class="profile-actions">${sourceLink(p.tatUrl,'ข้อมูลท่องเที่ยวและของดีในพื้นที่จาก ททท.')}</div>`;
      case 'brief': return `<div class="profile-subsection"><h5>ลักษณะภูมิประเทศ</h5><p>${esc(d.geography)}</p><h5>พัฒนาการทางประวัติศาสตร์</h5><p>${esc(histories[p.id]?.intro||'รายละเอียดประวัติอยู่ในหมวดประวัติความเป็นมา')}</p><h5>สังคม วัฒนธรรม และเอกลักษณ์</h5><p>${esc(d.culture)}</p><h5>เศรษฐกิจและวิถีชีวิต</h5><p>${esc(d.economy)}</p><h5>การท่องเที่ยว</h5><p>แหล่งท่องเที่ยวที่น่าสนใจ ได้แก่ ${esc(d.places.slice(0,3).map(a=>a[0]).join(' / '))} โดยควรตรวจสอบวันเปิดบริการและข้อกำหนดล่าสุดก่อนเดินทาง</p></div><div class="profile-actions"><button class="btn" type="button" data-profile-section="history">${icon('history')} ดูลำดับเหตุการณ์</button></div>`;
      case 'links': return `<p class="profile-lead">แหล่งข้อมูลสำหรับตรวจสอบและอ่านรายละเอียดเพิ่มเติม</p><div class="profile-link-list">${source}${sourceLink(p.tatUrl,'การท่องเที่ยวแห่งประเทศไทย — จังหวัด'+name)}${sourceLink(p.mapsUrl,'Google Maps — '+name)}${sourceLink(royalReference,'สำนักงานราชบัณฑิตยสภา — คำขวัญและต้นไม้')}${(histories[p.id]?.sources||[]).map(([title,url])=>sourceLink(url,title)).join('')}${d.flowerSource?sourceLink(d.flowerSource,'เอกสารดอกไม้ประจำจังหวัด'):''}</div>`;
      case 'credits': return `<div class="profile-status">${icon('info')}<div><strong>DISCOVER THAILAND • โครงการสารสนเทศเพื่อการศึกษา</strong><p>ข้อมูลนี้จัดเรียบเรียงเป็นคู่มือท่องเที่ยวและสารานุกรมจังหวัดแบบไม่เป็นทางการ ผู้จัดทำเว็บไม่ได้ระบุชื่อบุคคลในข้อมูลต้นฉบับ จึงไม่ใส่ชื่อผู้จัดทำขึ้นเอง</p></div></div><p class="profile-explain">คำขวัญและต้นไม้: สำนักงานราชบัณฑิตยสภา • ประวัติศาสตร์: อ้างอิงลิงก์ในหมวดประวัติ • ดอกไม้: แหล่งจังหวัดที่ระบุไว้ • ข้อมูลทั่วไปและอาหาร: เรียบเรียงเพื่อให้ความรู้เบื้องต้น • แผนที่: Google Maps</p>${sourceLink(royalReference,'แหล่งอ้างอิงหลัก')}`;
      default: return '';
    }
  }

  function selectProvince(id, scroll=true) {
    if (!provinces.some(p => p.id === id)) return;
    const p=provinces.find(p=>p.id===id);
    state.provinceId=id;
    if (state.region !== 'ทั้งหมด' && p.region !== state.region) state.region='ทั้งหมด';
    state.category='all'; state.query=''; $('searchInput').value='';
    state.mapOpen=false; renderAll();
    if(scroll) window.scrollTo({ top:0, behavior:isReducedMotion()?'auto':'smooth' });
  }
  function selectRegion(region) {
    if(!regions.includes(region)) return;
    state.region=region;
    const available=availableProvinces();
    if (available.length && !available.some(p=>p.id===state.provinceId)) state.provinceId=available[0].id;
    state.category='all'; state.query=''; $('searchInput').value='';
    renderAll(); $('provincePills').scrollLeft=0;
  }
  function selectTab(tab) {
    if (!['attractions','foods','itinerary','travel_tips','history','profile','map_explore','trip_planner','forecast','all_provinces'].includes(tab)) return;
    state.tab=tab;
    if (!['attractions','foods'].includes(tab)) { state.query=''; $('searchInput').value=''; }
    renderTabs(); renderContent();
  }
  function toggleFavorite(id) {
    if (!findItem(id)) return;
    state.favorites = isFav(id) ? state.favorites.filter(x=>x!==id) : [...state.favorites,id];
    store.set('th_travel_favs',JSON.stringify(state.favorites.map(x=>({id:x}))));
    updateFavoriteCount();
    renderContent();
    if (state.activeOverlay==='detail') renderDetail();
    if (state.activeOverlay==='favorites') renderFavorites();
  }
  function updateFavoriteCount() {
    $('favoriteCount').textContent=state.favorites.length;
    $('favoriteCount').hidden=state.favorites.length===0;
  }
  function showOverlay(which) {
    const el=$(which==='detail' ? 'detailOverlay':'favoritesOverlay');
    state.previousFocus=document.activeElement;
    state.activeOverlay=which;
    el.hidden=false; document.body.classList.add('no-scroll');
    (el.querySelector('[data-close]')||el.querySelector('button'))?.focus();
  }
  function closeOverlay(which) {
    if(state.activeOverlay!==which) return;
    $(which==='detail' ? 'detailOverlay':'favoritesOverlay').hidden=true;
    state.activeOverlay=null;
    if(which==='detail') state.selectedItem=null;
    document.body.classList.remove('no-scroll');
    state.previousFocus?.focus?.(); state.previousFocus=null;
  }
  function openDetail(id) {
    const item=findItem(id); if(!item || item.isFood) return;
    state.selectedItem=item;
    renderDetail(); showOverlay('detail');
  }
  function renderDetail() {
    const item=state.selectedItem; if(!item) return;
    $('detailContent').innerHTML=`<div class="dialog-image">${item.image?`<img src="${esc(safeURL(item.image))}" alt="${esc(item.title)}">`:`<div class="photo-placeholder"><img class="photo-placeholder-map" src="assets/img/map-brand.png" alt="ภาพสัญลักษณ์แผนที่"><span>${esc(item.provinceName)}</span></div>`}<button class="icon-button dialog-close" data-close="detail" type="button" aria-label="ปิดรายละเอียด">${icon('close')}</button><div class="dialog-photo-title" id="detailTitle">${esc(item.title)}</div></div><div class="dialog-body"><div class="dialog-location">${icon('pin')}${esc(item.provinceName)} • ${esc(item.location)} ${item.rating ? ` • ${icon('star')} ${esc(item.rating)}` : ''}</div><p>${esc(item.fullDesc || item.shortDesc)}</p><div class="dialog-info"><div><small>เวลาเปิดทำการ (ตามข้อมูลตัวอย่าง)</small><strong>${esc(item.hours || 'ไม่ระบุ')}</strong></div><div><small>ค่าเข้าชม (ตามข้อมูลตัวอย่าง)</small><strong>${esc(item.fee || 'ไม่ระบุ')}</strong></div></div><p class="data-verification">หมายเหตุ: เวลาทำการ ค่าเข้าชม และคะแนนในชุดข้อมูลเดิมอาจไม่เป็นปัจจุบัน กรุณาตรวจสอบก่อนเดินทางกับ <a href="${esc(safeURL(provinces.find(p=>p.id===item.provinceId)?.tatUrl))}" target="_blank" rel="noopener noreferrer">ททท. หรือหน่วยงานเจ้าของสถานที่</a></p><div class="dialog-actions"><button class="btn ${isFav(item.id)?'btn-danger-quiet':'btn-primary'}" type="button" data-favorite="${esc(item.id)}">${icon('heart')}${isFav(item.id)?'นำออกจากรายการโปรด':'บันทึกรายการโปรด'}</button><a class="btn btn-secondary" href="${esc(mapsSearchFor(item))}" target="_blank" rel="noopener noreferrer">${icon('map')}ค้นหาสถานที่ใน Maps</a><button class="btn btn-secondary" type="button" data-plan-add="${esc(item.id)}">${icon('route')} เพิ่มในทริป</button><button class="btn btn-secondary" type="button" data-share-place="${esc(item.id)}">${icon('external')} แชร์สถานที่</button><button class="btn" type="button" data-close="detail">ปิดหน้าต่าง</button></div></div>`;
  }
  function openFavorites() { renderFavorites(); showOverlay('favorites'); }
  function renderFavorites() {
    $('drawerCount').textContent=`(${state.favorites.length})`;
    $('clearFavorites').hidden=state.favorites.length===0;
    $('favoritesItems').innerHTML = state.favorites.length ? state.favorites.map(id => {
      const item=findItem(id); if(!item) return '';
      return `<article class="drawer-item">${item.image ? `<img src="${esc(safeURL(item.image))}" alt="" loading="lazy">` : `<div class="drawer-fallback">${icon(item.isFood?'food':'map')}</div>`}<div class="drawer-item-body"><strong>${esc(item.title || item.name)}</strong><small>${esc(item.provinceName)} ${item.isFood?'• อาหารท้องถิ่น':''}</small>${!item.isFood ? `<button type="button" class="text-action" data-detail="${esc(id)}">ดูรายละเอียด ${icon('arrow')}</button>`:''}</div><button type="button" class="icon-button" data-favorite="${esc(id)}" aria-label="ลบ ${esc(item.title||item.name)} ออกจากรายการโปรด">${icon('trash')}</button></article>`;
    }).join('') : `<div class="empty-state">${icon('heart')}<h3>ยังไม่มีรายการโปรด</h3><p>กดปุ่มรูปหัวใจที่สถานที่หรืออาหารเพื่อบันทึกไว้ที่นี่</p></div>`;
  }
  function clearFavorites() { state.favorites=[]; store.remove('th_travel_favs'); updateFavoriteCount(); renderContent(); renderFavorites(); }

  function bindEvents() {
    $('brandHome').addEventListener('click',()=>selectProvince('chiangmai'));
    $('brandHome').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();selectProvince('chiangmai');}});
    $('themeToggle').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';store.set('th_minimal_theme',state.theme);applyTheme();});
    $('favoriteOpen').addEventListener('click',openFavorites);
    $('provinceSelect').addEventListener('change',e=>selectProvince(e.target.value));
    $('searchInput').addEventListener('input',e=>{state.query=e.target.value;if(!['attractions','foods'].includes(state.tab)){state.tab='attractions';renderTabs();}renderContent();});
    $('regionTabs').addEventListener('click',e=>{const b=e.target.closest('[data-region]');if(b)selectRegion(b.dataset.region);});
    $('provincePills').addEventListener('click',e=>{const b=e.target.closest('[data-province]');if(b)selectProvince(b.dataset.province);});
    $('provincePrev').addEventListener('click',()=>$('provincePills').scrollBy({left:-280,behavior:isReducedMotion()?'auto':'smooth'}));
    $('provinceNext').addEventListener('click',()=>$('provincePills').scrollBy({left:280,behavior:isReducedMotion()?'auto':'smooth'}));
    $('tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)selectTab(b.dataset.tab);});
    $('tabs').addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const tabs=[...$('tabs').querySelectorAll('[data-tab]')];const i=tabs.findIndex(t=>t.dataset.tab===state.tab);const t=tabs[(i+tabs.length+(e.key==='ArrowRight'?1:-1))%tabs.length];selectTab(t.dataset.tab);t.focus();}});
    $('categoryFilters').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b){state.category=b.dataset.category;renderContent();}});
    $('searchNotice').addEventListener('click',e=>{if(e.target.closest('#clearSearch'))resetSearch();});
    $('contentView').addEventListener('click',e=>{if(window.DiscoverThailandExtras?.handleClick(e,pCurrent(),provinces))return;const f=e.target.closest('[data-favorite]');if(f){toggleFavorite(f.dataset.favorite);return;}const d=e.target.closest('[data-detail]');if(d){openDetail(d.dataset.detail);return;}const jump=e.target.closest('[data-history-to]');if(jump){selectTab(jump.dataset.historyTo);return;}const sec=e.target.closest('[data-profile-section]');if(sec){state.profileSection=sec.dataset.profileSection;state.mapOpen=false;renderContent();return;}if(e.target.closest('[data-map-toggle]')){state.mapOpen=!state.mapOpen;renderContent();return;}if(e.target.closest('#resetFilters')){resetSearch();state.category='all';renderContent();}});
    $('detailOverlay').addEventListener('click',e=>{if(window.DiscoverThailandExtras?.handleClick(e,pCurrent(),provinces))return;const close=e.target.closest('[data-close="detail"]');if(close){closeOverlay('detail');return;}const f=e.target.closest('[data-favorite]');if(f)toggleFavorite(f.dataset.favorite);});
    $('favoritesOverlay').addEventListener('click',e=>{const close=e.target.closest('[data-close="favorites"]');if(close){closeOverlay('favorites');return;}const f=e.target.closest('[data-favorite]');if(f){toggleFavorite(f.dataset.favorite);return;}const d=e.target.closest('[data-detail]');if(d){const id=d.dataset.detail;closeOverlay('favorites');openDetail(id);}});
    $('clearFavorites').addEventListener('click',clearFavorites);
    $('contentView').addEventListener('input',e=>window.DiscoverThailandExtras?.handleInput(e,pCurrent(),provinces));
    $('contentView').addEventListener('change',e=>window.DiscoverThailandExtras?.handleChange(e,pCurrent(),provinces));
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && state.activeOverlay){closeOverlay(state.activeOverlay);return;}
      if(e.key==='/' && !state.activeOverlay && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();$('searchInput').focus();}
      if(e.key==='Tab' && state.activeOverlay) {
        const box=$(state.activeOverlay==='detail'?'detailOverlay':'favoritesOverlay');
        const focusable=[...box.querySelectorAll('button:not([hidden]):not(:disabled),a[href],input,select,[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length);
        if(!focusable.length)return;
        const first=focusable[0],last=focusable[focusable.length-1];
        if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
  }
  function resetSearch() { state.query='';$('searchInput').value='';renderContent(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init);
  else init();
  // Explicit test hook containing only public view state; does not run extra timers or loops.
  window.DiscoverThailandUI = { selectProvince, selectRegion, selectTab, openDetail, search(q){state.query=String(q);$('searchInput').value=state.query;renderContent();}, get state(){return {...state,favorites:[...state.favorites]};}, getItems(type){return currentCandidates(type);} };
})();
