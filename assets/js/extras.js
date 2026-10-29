/* Discover Thailand · Optional guide modules.
   No tracking, no API keys, no animation loops, and no fabricated site coordinates/prices.
   The map searches the exact place name on Google Maps rather than pretending a
   provincial capital coordinate belongs to a tourist attraction.
*/
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const fmt = new Intl.NumberFormat('th-TH');
  const money = value => `${fmt.format(Math.max(0, Number(value) || 0))} ฿`;
  const safeGet = key => {try{return localStorage.getItem(key);}catch{return null;}};
  const safeSet = (key,val) => {try{localStorage.setItem(key,val);return true;}catch{return false;}};
  const PLAN_KEY = 'discover_thailand_plans_v1';
  const forecastCache = new Map();
  const FORECAST_TTL = 15*60*1000;
  let forecastRequest = 0;
  let directoryQuery = '';
  let mapSelection = '';
  let messageTimer = null;
  let activeTab = '';
  let activeProvinceId = '';

  const directory = {
    'ภาคเหนือ': 'เชียงใหม่ เชียงราย ลำพูน ลำปาง แพร่ น่าน พะเยา แม่ฮ่องสอน อุตรดิตถ์ ตาก สุโขทัย พิษณุโลก พิจิตร เพชรบูรณ์ กำแพงเพชร นครสวรรค์ อุทัยธานี',
    'ภาคกลาง': 'กรุงเทพมหานคร ชัยนาท สิงห์บุรี ลพบุรี สระบุรี อ่างทอง พระนครศรีอยุธยา ปทุมธานี นนทบุรี นครปฐม สมุทรปราการ สมุทรสาคร สมุทรสงคราม สุพรรณบุรี นครนายก',
    'ภาคตะวันตก': 'ราชบุรี กาญจนบุรี เพชรบุรี ประจวบคีรีขันธ์',
    'ภาคตะวันออก': 'ชลบุรี ฉะเชิงเทรา ระยอง จันทบุรี ตราด ปราจีนบุรี สระแก้ว',
    'ภาคอีสาน': 'กาฬสินธุ์ ขอนแก่น ชัยภูมิ นครพนม นครราชสีมา บึงกาฬ บุรีรัมย์ มหาสารคาม มุกดาหาร ยโสธร ร้อยเอ็ด เลย ศรีสะเกษ สกลนคร สุรินทร์ หนองคาย หนองบัวลำภู อำนาจเจริญ อุดรธานี อุบลราชธานี',
    'ภาคใต้': 'กระบี่ ชุมพร ตรัง นครศรีธรรมราช นราธิวาส ปัตตานี พังงา พัทลุง ภูเก็ต ยะลา ระนอง สงขลา สตูล สุราษฎร์ธานี'
  };
  const districts = Object.entries(directory).flatMap(([region,names])=>names.split(' ').map(name=>({name,region})));
  if (districts.length !== 77 || new Set(districts.map(x=>x.name)).size!==77) console.warn('Province directory needs review', districts.length);
  const plainName = p => p.nameTh.replace(/\s*\(.+$/, '');
  const mapsQuery = (name, province) => `${name}, ${plainName(province)}, ประเทศไทย`;
  const mapsUrl = (name, province) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery(name,province))}`;
  const embedUrl = (name, province) => `https://maps.google.com/maps?q=${encodeURIComponent(mapsQuery(name,province))}&z=12&output=embed`;
  const directionUrl = (name, province) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery(name,province))}&travelmode=driving`;
  const itemProvince = (id, provinces) => provinces.find(p=>p.attractions.some(x=>x.id===id));

  function loadPlans() {try{const data=JSON.parse(safeGet(PLAN_KEY)||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch{return {};}}
  function planFor(id) {
    const raw=loadPlans()[id] || {};
    const cleanStops=Array.isArray(raw.stops)?raw.stops.filter(x=>x&&typeof x.id==='string'&&Number.isInteger(x.day)&&x.day>=1&&x.day<=7).slice(0,50):[];
    const budget={};
    for(const key of ['transport','food','stay','ticket']) budget[key] = Math.min(1000000,Math.max(0,Number(raw.budget?.[key])||0));
    return {days:clamp(raw.days,1,7,2),people:clamp(raw.people,1,30,2),budget,stops:cleanStops};
  }
  function clamp(value,min,max,def){let n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:def;}
  function savePlan(id,plan){const data=loadPlans();data[id]=plan;return safeSet(PLAN_KEY,JSON.stringify(data));}
  function showToast(text){
    let node=$('tourToast');
    if(!node){node=document.createElement('div');node.id='tourToast';node.className='tour-toast';node.setAttribute('role','status');node.setAttribute('aria-live','polite');document.body.appendChild(node);}
    node.textContent=text;node.classList.add('visible');
    clearTimeout(messageTimer);messageTimer=setTimeout(()=>node.classList.remove('visible'),3600);
  }
  function refresh(province,provinces){if(!activeTab || !$('contentView'))return;render(activeTab,province,provinces);}
  function render(tab,province,provinces){
    activeTab=tab;activeProvinceId=province.id;
    const page=$('contentView');
    if(!page)return;
    if(tab==='map_explore') renderMap(page,province);
    else if(tab==='trip_planner') renderPlanner(page,province);
    else if(tab==='forecast') renderForecast(page,province);
    else if(tab==='all_provinces') renderDirectory(page,provinces);
  }
  function renderMap(page,p){
    const places=p.attractions;
    if(!places.length){page.innerHTML=`<div class="empty-state">${icon('map')}<h3>ยังไม่มีข้อมูลสถานที่</h3></div>`;return;}
    const selected=places.find(x=>x.id===mapSelection)||places[0];mapSelection=selected.id;
    page.innerHTML=`<section class="guide-feature">
      <div class="feature-heading"><div><p class="section-overline">EXPLORE THE MAP</p><h3>แผนที่สถานที่ท่องเที่ยว · ${esc(plainName(p))}</h3><p>เลือกสถานที่จากรายการเพื่อแสดงตำแหน่งค้นหาบนแผนที่ และเปิดเส้นทางนำทางได้</p></div><span class="guide-stat">${fmt.format(places.length)} สถานที่</span></div>
      <div class="map-explorer"><div class="map-places" role="group" aria-label="สถานที่ท่องเที่ยวในจังหวัด">${places.map((item,i)=>`<button class="map-place ${item.id===selected.id?'active':''}" type="button" data-map-select="${esc(item.id)}" aria-pressed="${item.id===selected.id}"><span class="map-place-num">${String(i+1).padStart(2,'0')}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.location||plainName(p))}</small></span>${icon('arrow')}</button>`).join('')}</div>
      <div class="map-view"><div class="map-view-head"><div><strong id="mapSelectedTitle">${esc(selected.title)}</strong><small>ค้นหาด้วยชื่อสถานที่ — ไม่ใช่หมุดพิกัดที่ยืนยันไว้</small></div></div><iframe id="interactivePlaceMap" class="travel-map-frame" src="${esc(embedUrl(selected.title,p))}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="แผนที่ค้นหา ${esc(selected.title)}"></iframe><div class="map-tools"><a id="mapSearchLink" class="btn btn-primary" href="${esc(mapsUrl(selected.title,p))}" target="_blank" rel="noopener noreferrer">${icon('map')}ดูสถานที่ใน Maps</a><a id="mapDirectionsLink" class="btn btn-secondary" href="${esc(directionUrl(selected.title,p))}" target="_blank" rel="noopener noreferrer">${icon('route')}นำทาง</a><button class="btn" data-map-add="${esc(selected.id)}" type="button">${icon('heart')}เพิ่มลงทริป</button><a class="btn btn-quiet" href="${esc(routeForPlan({stops:places.slice(0,4).map(x=>({id:x.id,day:1}))},p))}" target="_blank" rel="noopener noreferrer">${icon('pin')}ดูหลายจุด (สูงสุด 4)</a></div></div></div>
      <p class="guide-disclaimer">แผนที่ใช้การค้นหาชื่อสถานที่ผ่าน Google Maps ซึ่งอาจพบหลายรายการหรือแสดงจุดคลาดเคลื่อน กรุณาตรวจสอบชื่อและตำแหน่งก่อนเดินทางจริง แผนที่ต้องใช้อินเทอร์เน็ต</p>
      </section>`;
  }
  function renderPlanner(page,p){
    const plan=planFor(p.id);
    const found=p.attractions.filter(it=>plan.stops.some(x=>x.id===it.id));
    const dayCost=Object.values(plan.budget).reduce((a,b)=>a+b,0);
    const total=dayCost*plan.days*plan.people;
    const form=(key,label)=>`<label class="budget-input"><span>${esc(label)} <small>บาท/คน/วัน</small></span><input type="number" inputmode="numeric" min="0" max="1000000" step="100" data-budget="${key}" value="${plan.budget[key]}" aria-label="งบ${esc(label)}ต่อคนต่อวัน"></label>`;
    page.innerHTML=`<section class="guide-feature"><div class="feature-heading"><div><p class="section-overline">PERSONAL TRIP PLANNER</p><h3>จัดทริป ${esc(plainName(p))}</h3><p>เลือกสถานที่ จัดวันเดินทาง และกรอกงบที่คุณตั้งเอง ข้อมูลเก็บไว้ในเบราว์เซอร์นี้</p></div><span class="guide-stat">${found.length} จุดแวะ</span></div>
    <div class="planner-layout"><div class="planner-workspace"><div class="planner-settings"><label>จำนวนวัน<select data-plan-setting="days" aria-label="จำนวนวันที่ไปเที่ยว">${Array.from({length:7},(_,i)=>`<option value="${i+1}" ${plan.days===i+1?'selected':''}>${i+1} วัน</option>`).join('')}</select></label><label>จำนวนผู้เดินทาง<input data-plan-setting="people" type="number" min="1" max="30" value="${plan.people}" aria-label="จำนวนผู้เดินทาง"></label></div>
    <div class="day-stacks">${Array.from({length:plan.days},(_,day)=>{
      const stops=plan.stops.filter(s=>s.day===day+1);
      return `<section class="day-block"><header><strong>DAY ${day+1}</strong><small>${stops.length} สถานที่</small></header><div class="day-stops">${stops.length?stops.map((s,index)=>{const item=p.attractions.find(it=>it.id===s.id);if(!item)return '';return `<div class="day-stop"><span class="day-sequence">${index+1}</span><span class="day-stop-title">${esc(item.title)}</span><select class="stop-day-select" data-stop-day="${esc(item.id)}" aria-label="เลือกวันสำหรับ ${esc(item.title)}">${Array.from({length:plan.days},(_,n)=>`<option value="${n+1}" ${n+1===s.day?'selected':''}>วันที่ ${n+1}</option>`).join('')}</select><button class="mini-icon" type="button" data-stop-up="${esc(item.id)}" title="เลื่อนขึ้น" ${index===0?'disabled':''}>↑</button><button class="mini-icon" type="button" data-stop-down="${esc(item.id)}" title="เลื่อนลง" ${index===stops.length-1?'disabled':''}>↓</button><button class="mini-icon danger" type="button" data-stop-remove="${esc(item.id)}" aria-label="ลบ ${esc(item.title)}">×</button></div>`;}).join(''):`<p class="day-empty">ยังไม่มีสถานที่ในวันที่ ${day+1} — เพิ่มจากรายการด้านล่าง</p>`}</div></section>`;
    }).join('')}</div><div class="planner-places"><h4>เลือกสถานที่ที่อยากไป</h4><div class="planner-picker">${p.attractions.map(item=>`<button class="planner-add ${plan.stops.some(s=>s.id===item.id)?'already':''}" type="button" data-plan-add="${esc(item.id)}" ${plan.stops.some(s=>s.id===item.id)?'disabled':''}><span>${esc(item.title)}</span><span>${plan.stops.some(s=>s.id===item.id)?'เพิ่มแล้ว':'＋ เพิ่ม'}</span></button>`).join('')}</div></div></div>
    <aside class="planner-budget"><div class="budget-title">${icon('ticket')}<h4>งบประมาณทริป</h4></div><p>ตั้งงบประมาณตามที่คาดว่าจะใช้จริง ไม่ใช่ราคาที่เว็บไซต์ตรวจสอบให้</p>${form('transport','ค่าเดินทาง')}${form('food','อาหาร')}${form('stay','ที่พัก')}${form('ticket','ค่าเข้าชม/กิจกรรม')}<div class="budget-total"><small>รวมประมาณการทั้งกลุ่ม</small><strong id="budgetTotal">${money(total)}</strong><span id="budgetFormula">${money(dayCost)} × ${plan.days} วัน × ${plan.people} คน</span></div><div class="planner-actions"><a class="btn btn-primary" id="plannerRoute" target="_blank" rel="noopener noreferrer" ${found.length?'href="'+esc(routeForPlan(plan,p))+'"':'aria-disabled="true"'}>${icon('route')}เส้นทางใน Google Maps</a><button class="btn btn-secondary" type="button" data-plan-export>${icon('external')}ส่งออกแผน (.csv)</button><button class="btn btn-danger-quiet" type="button" data-plan-clear>${icon('trash')}ล้างแผนจังหวัดนี้</button></div><p class="guide-disclaimer">งบที่กรอกคิดต่อคนต่อวันเท่ากันทุกวัน ค่าที่พักจริงอาจไม่ตรงกับสูตรนี้ และ Google Maps อาจจำกัดจำนวนจุดแวะบนมือถือ (เส้นทางใช้ไม่เกิน 4 จุดแรก)</p></aside></div></section>`;
  }
  function routeForPlan(plan,province){
    const stops=plan.stops.slice().sort((a,b)=>a.day-b.day).map(s=>province.attractions.find(x=>x.id===s.id)).filter(Boolean).slice(0,4);
    if(!stops.length)return '#';
    const d=stops.at(-1);
    let uri=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery(d.title,province))}&travelmode=driving`;
    if(stops.length>1)uri+=`&waypoints=${encodeURIComponent(stops.slice(0,-1).map(x=>mapsQuery(x.title,province)).join('|'))}`;
    return uri;
  }
  function renderForecast(page,p){
    const point=window.ThaiProvinceAtlasLive?.getLocation(p.id);
    page.innerHTML=`<section class="guide-feature"><div class="feature-heading"><div><p class="section-overline">7-DAY FORECAST</p><h3>พยากรณ์อากาศ 7 วัน · ${esc(plainName(p))}</h3><p>ค่าพยากรณ์อ้างอิงพื้นที่ ${esc(point?.label||plainName(p))} จากแบบจำลอง Open-Meteo</p></div><button class="btn btn-secondary" type="button" data-forecast-refresh>${icon('history')}อัปเดต</button></div><div id="forecastStatus" role="status" class="guide-status">กำลังดึงข้อมูลพยากรณ์...</div><div id="forecastDays" class="forecast-grid"></div><div class="guide-disclaimer">อุณหภูมิสูงสุด–ต่ำสุดและโอกาสฝนตกเป็นค่าพยากรณ์ ไม่ใช่การตรวจวัด ณ ทุกสถานที่ ข้อมูลอาจเปลี่ยนแปลงได้ ก่อนเดินทางควรตรวจประกาศเตือนจาก <a href="https://www.tmd.go.th/" target="_blank" rel="noopener noreferrer">กรมอุตุนิยมวิทยา</a></div></section>`;
    if(!point){$('forecastStatus').textContent='ยังไม่มีจุดพยากรณ์สำหรับจังหวัดนี้';return;}
    void fetchForecast(p.id,point);
  }
  function weatherWord(code){return window.ThaiProvinceAtlasLive?.describeWeather(Number(code)) || 'สภาพอากาศ';}
  async function fetchForecast(id,point,forced=false){
    const request=++forecastRequest;
    const existing=forecastCache.get(id);
    if(!forced&&existing&&Date.now()-existing.time<FORECAST_TTL){showForecast(existing.data,id,false);return;}
    const query=new URLSearchParams({latitude:String(point.lat),longitude:String(point.lon),daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',timezone:'Asia/Bangkok',forecast_days:'7'});
    try{
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
      let response;
      try{response=await fetch('https://api.open-meteo.com/v1/forecast?'+query,{signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer);}
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();
      if(!Array.isArray(data?.daily?.time)||!data.daily.time.length)throw new Error('Missing forecast');
      forecastCache.set(id,{data,time:Date.now()});
      if(request===forecastRequest)showForecast(data,id,false);
    }catch(error){
      if(request!==forecastRequest||activeTab!=='forecast'||activeProvinceId!==id)return;
      if(existing)showForecast(existing.data,id,true);
      else {if($('forecastStatus'))$('forecastStatus').textContent='ไม่สามารถโหลดพยากรณ์ได้ กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วกดอัปเดต';}
    }
  }
  function showForecast(data,id,isOld){
    if(activeTab!=='forecast'||activeProvinceId!==id||!$('forecastDays'))return;
    const daily=data.daily;
    $('forecastDays').innerHTML=daily.time.map((date,i)=>{
      const high=Number(daily.temperature_2m_max?.[i]);const low=Number(daily.temperature_2m_min?.[i]);const rain=Number(daily.precipitation_probability_max?.[i]);
      const day=new Intl.DateTimeFormat('th-TH',{weekday:'short',day:'numeric',month:'short',timeZone:'Asia/Bangkok'}).format(new Date(date+'T12:00:00+07:00'));
      return `<article class="forecast-card"><time datetime="${esc(date)}">${esc(day)}</time><strong>${esc(weatherWord(daily.weather_code?.[i]))}</strong><div class="forecast-temp">${Number.isFinite(high)?Math.round(high)+'°':'—'} <span>/ ${Number.isFinite(low)?Math.round(low)+'°':'—'}</span></div><div class="forecast-rain">${icon('cloud')}โอกาสฝน ${Number.isFinite(rain)?Math.round(rain)+'%':'—'}</div></article>`;
    }).join('');
    $('forecastStatus').textContent=(isOld?'กำลังแสดงข้อมูลเดิม — ไม่สามารถอัปเดตได้':'ข้อมูลพยากรณ์ล่าสุดจาก Open-Meteo')+' • จุดอ้างอิง ไม่ใช่เครื่องวัด ณ สถานที่';
  }
  function renderDirectory(page,provinces){
    const available=new Map(provinces.map(p=>[plainName(p),p]));
    page.innerHTML=`<section class="guide-feature"><div class="feature-heading"><div><p class="section-overline">ALL 77 PROVINCES</p><h3>สารบัญจังหวัดทั่วประเทศไทย</h3><p>77 จังหวัด • ${available.size} จังหวัดมีบทความเต็ม • ที่เหลือมีรายชื่อเพื่อค้นหาข้อมูลและนำทาง ยังไม่ใช่บทความสมบูรณ์</p></div><span class="guide-stat">${available.size}/77 มีข้อมูล</span></div><label class="directory-search">${icon('search')}<input id="directorySearch" type="search" value="${esc(directoryQuery)}" placeholder="ค้นหาจากชื่อจังหวัด..." aria-label="ค้นหารายชื่อ 77 จังหวัด"></label><div id="directoryResults"></div><p class="guide-disclaimer">การแบ่งภูมิภาคในสารบัญเป็นรูปแบบเพื่อการท่องเที่ยว อาจต่างจากเกณฑ์ราชการ จังหวัดที่แสดงว่า “รอข้อมูล” จะเปิดให้ค้นหาบน Google Maps แทนการสร้างบทความสมมติ</p></section>`;
    renderDirectoryResults(provinces);
  }
  function renderDirectoryResults(provinces){
    const el=$('directoryResults');if(!el)return;
    const available=new Map(provinces.map(p=>[plainName(p),p]));
    const search=directoryQuery.trim().toLocaleLowerCase('th');
    const group=Object.entries(directory).map(([region,names])=>{
      const items=names.split(' ').filter(name=>name.toLocaleLowerCase('th').includes(search));
      if(!items.length)return '';
      return `<section class="directory-region"><h4>${esc(region)} <span>${items.length} จังหวัด</span></h4><div class="directory-grid">${items.map(name=>{const p=available.get(name);return p?`<button class="directory-province available" type="button" data-directory-province="${esc(p.id)}"><span>${esc(name)}</span><small>มีบทความเต็ม ${icon('arrow')}</small></button>`:`<a class="directory-province" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name+' ประเทศไทย')}" target="_blank" rel="noopener noreferrer"><span>${esc(name)}</span><small>รอข้อมูล • เปิด Maps ${icon('external')}</small></a>`;}).join('')}</div></section>`;
    }).join('');
    el.innerHTML=group||'<div class="empty-state"><h3>ไม่พบจังหวัดที่ค้นหา</h3></div>';
  }
  async function sharePlace(item,province){
    const url=new URL(window.location.href);
    url.search='';url.hash='';url.searchParams.set('province',province.id);url.searchParams.set('tab','attractions');url.searchParams.set('place',item.id);
    if(url.protocol==='file:'){
      showToast('เปิดผ่านเว็บเซิร์ฟเวอร์เพื่อแชร์ลิงก์ให้ผู้อื่นได้');return;
    }
    const content={title:`${item.title} | Discover Thailand`,text:`${item.title} — ${plainName(province)}`,url:url.toString()};
    try{if(navigator.share){await navigator.share(content);return;}if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url.toString());showToast('คัดลอกลิงก์สถานที่แล้ว');return;}}catch(err){if(err?.name==='AbortError')return;}
    window.prompt('คัดลอกลิงก์นี้',url.toString());
  }
  function planAdd(id,province,provinces){
    const actual=itemProvince(id,provinces);if(!actual)return;
    const plan=planFor(actual.id);
    if(plan.stops.some(x=>x.id===id)){showToast('สถานที่นี้อยู่ในแผนแล้ว');return;}
    if(plan.stops.length>=30){showToast('เพิ่มได้ไม่เกิน 30 สถานที่ต่อจังหวัด');return;}
    const counts=Array.from({length:plan.days},(_,i)=>plan.stops.filter(s=>s.day===i+1).length);
    const day=counts.indexOf(Math.min(...counts))+1;
    plan.stops.push({id,day});savePlan(actual.id,plan);
    const overlay=$('detailOverlay');if(overlay&&!overlay.hidden)overlay.querySelector('[data-close="detail"]')?.click();
    if(actual.id!==province.id)window.DiscoverThailandUI.selectProvince(actual.id,false);
    window.DiscoverThailandUI.selectTab('trip_planner');
    showToast(`เพิ่ม ${actual.attractions.find(x=>x.id===id)?.title||'สถานที่'} ในทริปวันที่ ${day} แล้ว`);
  }
  function planEdit(p,update){const plan=planFor(p.id);update(plan);savePlan(p.id,plan);renderPlanner($('contentView'),p);}
  function moveStop(id,dir,p){planEdit(p,plan=>{
    const current=plan.stops.find(s=>s.id===id);if(!current)return;
    const matches=plan.stops.filter(s=>s.day===current.day);const i=matches.findIndex(s=>s.id===id);const swap=matches[i+dir];if(!swap)return;
    const ia=plan.stops.indexOf(current),ib=plan.stops.indexOf(swap);[plan.stops[ia],plan.stops[ib]]=[plan.stops[ib],plan.stops[ia]];
  });}
  function exportPlan(p){
    const plan=planFor(p.id);
    const rows=[['จังหวัด','วัน','สถานที่','ค่าเดินทาง/คน/วัน','ค่าอาหาร/คน/วัน','ค่าที่พัก/คน/วัน','ค่ากิจกรรม/คน/วัน','จำนวนผู้เดินทาง']];
    plan.stops.slice().sort((a,b)=>a.day-b.day).forEach(stop=>rows.push([plainName(p),stop.day,p.attractions.find(x=>x.id===stop.id)?.title||'',plan.budget.transport,plan.budget.food,plan.budget.stay,plan.budget.ticket,plan.people]));
    if(rows.length===1)rows.push([plainName(p),'','ยังไม่มีสถานที่',plan.budget.transport,plan.budget.food,plan.budget.stay,plan.budget.ticket,plan.people]);
    const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='discover-thailand-trip-'+p.id+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
    showToast('ส่งออกไฟล์แผนท่องเที่ยวแล้ว');
  }
  function handleClick(e,p,provinces){
    const t=e.target.closest('[data-map-select],[data-map-add],[data-plan-add],[data-stop-remove],[data-stop-up],[data-stop-down],[data-plan-clear],[data-plan-export],[data-directory-province],[data-forecast-refresh],[data-share-place]');
    if(!t)return false;
    if(t.hasAttribute('data-map-select')) {mapSelection=t.dataset.mapSelect;renderMap($('contentView'),p);return true;}
    if(t.hasAttribute('data-map-add')) {planAdd(t.dataset.mapAdd,p,provinces);return true;}
    if(t.hasAttribute('data-plan-add')) {planAdd(t.dataset.planAdd,p,provinces);return true;}
    if(t.hasAttribute('data-stop-remove')) {planEdit(p,plan=>{plan.stops=plan.stops.filter(s=>s.id!==t.dataset.stopRemove);});return true;}
    if(t.hasAttribute('data-stop-up')) {moveStop(t.dataset.stopUp,-1,p);return true;}
    if(t.hasAttribute('data-stop-down')) {moveStop(t.dataset.stopDown,1,p);return true;}
    if(t.hasAttribute('data-plan-clear')) {planEdit(p,plan=>{plan.stops=[];plan.budget={transport:0,food:0,stay:0,ticket:0};});showToast('ล้างทริปจังหวัดนี้แล้ว');return true;}
    if(t.hasAttribute('data-plan-export')) {exportPlan(p);return true;}
    if(t.hasAttribute('data-directory-province')) {window.DiscoverThailandUI.selectProvince(t.dataset.directoryProvince,false);window.DiscoverThailandUI.selectTab('profile');return true;}
    if(t.hasAttribute('data-forecast-refresh')) {const point=window.ThaiProvinceAtlasLive?.getLocation(p.id);if(point){$('forecastStatus').textContent='กำลังอัปเดตพยากรณ์...';void fetchForecast(p.id,point,true);}return true;}
    if(t.hasAttribute('data-share-place')) {const actual=itemProvince(t.dataset.sharePlace,provinces);const item=actual?.attractions.find(x=>x.id===t.dataset.sharePlace);if(item)void sharePlace(item,actual);return true;}
    return false;
  }
  function handleChange(e,p,provinces){
    const target=e.target;
    if(target.matches('[data-stop-day]')) {
      const key=target.dataset.stopDay,day=Number(target.value);
      planEdit(p,plan=>{const stop=plan.stops.find(s=>s.id===key);if(stop&&day>=1&&day<=plan.days)stop.day=day;});
      return true;
    }
    if(target.matches('[data-plan-setting]')){
      const key=target.dataset.planSetting;const value=clamp(target.value,1,key==='days'?7:30,2);
      planEdit(p,plan=>{plan[key]=value;if(key==='days')plan.stops.forEach(s=>{s.day=Math.min(s.day,value);});});return true;
    }
    return false;
  }
  function handleInput(e,p,provinces){
    const target=e.target;
    if(target.id==='directorySearch'){directoryQuery=target.value;renderDirectoryResults(provinces);return true;}
    if(target.matches('[data-budget]')){
      const key=target.dataset.budget;
      const plan=planFor(p.id);plan.budget[key]=Math.min(1000000,Math.max(0,Number(target.value)||0));savePlan(p.id,plan);
      const dayCost=Object.values(plan.budget).reduce((a,b)=>a+b,0);
      $('budgetTotal').textContent=money(dayCost*plan.days*plan.people);
      $('budgetFormula').textContent=`${money(dayCost)} × ${plan.days} วัน × ${plan.people} คน`;
      return true;
    }
    return false;
  }
  window.DiscoverThailandExtras={render,handleClick,handleChange,handleInput,mapsUrl,routeForPlan,planFor,get directory(){return districts;}};
})();
