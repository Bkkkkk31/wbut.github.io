/* DISCOVER THAILAND — Thailand local clock + Open-Meteo current conditions.
 * No frameworks, no background animation, no geolocation permission, no API keys.
 * Weather is a periodically updated numerical model estimate, not a live thermometer.
 */
(() => {
  'use strict';

  const TIME_ZONE = 'Asia/Bangkok';
  const REFRESH_MS = 15 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 10000;
  // Reference coordinates: representative provincial capitals/featured travel areas.
  // They are intentionally NOT described as readings from each attraction.
  const locations = Object.freeze({
    chiangmai:   { lat:18.7883, lon:98.9853, label:'ตัวเมืองเชียงใหม่' },
    nan:         { lat:18.7839, lon:100.7791, label:'ตัวเมืองน่าน' },
    chiangrai:   { lat:19.9072, lon:99.8309, label:'ตัวเมืองเชียงราย' },
    maehongson:  { lat:19.3016, lon:97.9654, label:'ตัวเมืองแม่ฮ่องสอน' },
    phuket:      { lat:7.8804, lon:98.3923, label:'ตัวเมืองภูเก็ต' },
    suratthani:  { lat:9.1382, lon:99.3215, label:'ตัวเมืองสุราษฎร์ธานี' },
    krabi:       { lat:8.0863, lon:98.9063, label:'ตัวเมืองกระบี่' },
    phangnga:    { lat:8.4501, lon:98.5255, label:'ตัวเมืองพังงา' },
    ayutthaya:   { lat:14.3532, lon:100.5689, label:'ตัวเมืองพระนครศรีอยุธยา' },
    kanchanaburi:{ lat:14.0228, lon:99.5328, label:'ตัวเมืองกาญจนบุรี' },
    chonburi:    { lat:12.9236, lon:100.8825, label:'พัทยา จ.ชลบุรี' },
    trat:        { lat:12.1090, lon:102.3580, label:'เกาะช้าง จ.ตราด' },
    prachuap:    { lat:12.5684, lon:99.9577, label:'หัวหิน จ.ประจวบคีรีขันธ์' },
    korat:       { lat:14.9785, lon:102.0977, label:'ตัวเมืองนครราชสีมา' },
    khonkaen:    { lat:16.4419, lon:102.8350, label:'ตัวเมืองขอนแก่น' },
    ubon:        { lat:15.2448, lon:104.8473, label:'ตัวเมืองอุบลราชธานี' },
    bangkok:     { lat:13.7563, lon:100.5018, label:'กรุงเทพมหานคร (ใจกลางเมือง)' }
  });

  const cache = new Map();
  const el = id => document.getElementById(id);
  const clockFormat = new Intl.DateTimeFormat('th-TH', {
    timeZone: TIME_ZONE, hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
  });
  const dateFormat = new Intl.DateTimeFormat('th-TH', {
    timeZone: TIME_ZONE, weekday:'long', day:'numeric', month:'short', year:'numeric'
  });
  let currentId = '';
  let activeController = null;
  let requestNumber = 0;
  let clockInterval = null;
  let weatherInterval = null;
  let lastClockDate = '';
  let initialized = false;

  function updateClock() {
    if (document.hidden) return;
    const now = new Date();
    const timeText = clockFormat.format(now);
    const dateText = dateFormat.format(now);
    if (el('heroClock') && el('heroClock').textContent !== timeText) el('heroClock').textContent = timeText;
    if (dateText !== lastClockDate) {
      lastClockDate = dateText;
      if (el('heroClockDate')) el('heroClockDate').textContent = dateText;
    }
  }

  function describeWeather(code) {
    if (code === 0) return 'ท้องฟ้าแจ่มใส';
    if (code === 1) return 'ฟ้าโปร่งเป็นส่วนใหญ่';
    if (code === 2) return 'มีเมฆบางส่วน';
    if (code === 3) return 'เมฆมาก';
    if (code === 45 || code === 48) return 'มีหมอก';
    if ([51,53,55,56,57].includes(code)) return 'ฝนละออง';
    if ([61,63,65,66,67].includes(code)) return 'มีฝน';
    if ([71,73,75,77,85,86].includes(code)) return 'หิมะหรือเกล็ดน้ำแข็ง';
    if ([80,81,82].includes(code)) return 'มีฝนเป็นช่วง ๆ';
    if ([95,96,99].includes(code)) return 'ฝนฟ้าคะนอง';
    return 'ไม่ระบุสภาพท้องฟ้า';
  }

  function displayWeather(record, stale=false) {
    const current = record.current;
    el('heroTemp').textContent = `${Number(current.temperature_2m).toFixed(1)}°C`;
    const detail = [describeWeather(current.weather_code)];
    if (Number.isFinite(Number(current.apparent_temperature)))
      detail.push(`รู้สึกเหมือน ${Number(current.apparent_temperature).toFixed(1)}°C`);
    if (Number.isFinite(Number(current.relative_humidity_2m)))
      detail.push(`ความชื้น ${Math.round(Number(current.relative_humidity_2m))}%`);
    el('heroCurrentConditions').textContent = detail.join(' • ');
    const at = String(current.time || '').slice(11,16);
    el('heroWeatherUpdated').textContent = `${stale ? 'ข้อมูลล่าสุดที่เก็บไว้' : 'ข้อมูลล่าสุด'} ${at || '--:--'} น. • ${stale ? 'ยังเชื่อมต่อไม่ได้' : 'อัปเดตตามรอบบริการ'}`;
    el('heroWeatherUpdated').dataset.stale = stale ? 'true' : 'false';
  }

  function updateStatus(message, isError=false) {
    el('heroWeatherUpdated').textContent = message;
    el('heroWeatherUpdated').dataset.stale = isError ? 'true' : 'false';
  }

  function weatherUrl(point) {
    const args = new URLSearchParams({
      latitude: String(point.lat), longitude: String(point.lon),
      current:'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code',
      timezone: TIME_ZONE,
      forecast_days:'1'
    });
    return `https://api.open-meteo.com/v1/forecast?${args}`;
  }

  async function fetchWeather(id, forced=false) {
    const point = locations[id];
    if (!point) return;
    const existing = cache.get(id);
    if (!forced && existing && Date.now() - existing.savedAt < REFRESH_MS) {
      displayWeather(existing.payload);
      return;
    }
    if (activeController) activeController.abort();
    const controller = new AbortController();
    activeController = controller;
    const requestId = ++requestNumber;
    const button = el('weatherRefresh');
    button.disabled = true;
    if (!existing) {
      el('heroTemp').textContent = 'กำลังโหลด...';
      el('heroCurrentConditions').textContent = 'กำลังดึงข้อมูลสภาพอากาศล่าสุด';
    }
    updateStatus('กำลังอัปเดตสภาพอากาศ...');
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(weatherUrl(point), {
        method:'GET', signal:controller.signal, cache:'no-store', mode:'cors'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error || !payload.current || !Number.isFinite(payload.current.temperature_2m) || !payload.current.time)
        throw new Error('Weather data invalid');
      if (requestId !== requestNumber || id !== currentId) return;
      const entry = { payload, savedAt:Date.now() };
      cache.set(id, entry);
      displayWeather(payload);
    } catch (err) {
      if (requestId !== requestNumber || id !== currentId) return;
      if (existing) displayWeather(existing.payload, true);
      else {
        el('heroTemp').textContent = 'ไม่มีข้อมูล';
        el('heroCurrentConditions').textContent = 'ไม่สามารถเชื่อมต่อสภาพอากาศได้';
        updateStatus('โปรดเช็กอินเทอร์เน็ตหรือกดอัปเดตอีกครั้ง', true);
      }
    } finally {
      clearTimeout(timer);
      if (requestId === requestNumber) {
        activeController = null;
        button.disabled = false;
      }
    }
  }

  function selectProvince(id) {
    if (!locations[id]) return;
    const changed = id !== currentId;
    currentId = id;
    el('heroWeatherLocation').textContent = `จุดอ้างอิง: ${locations[id].label}`;
    if (changed) {
      if (activeController) activeController.abort();
      requestNumber++;
      activeController = null;
      el('weatherRefresh').disabled = false;
      const cached = cache.get(id);
      if (cached) displayWeather(cached.payload, Date.now() - cached.savedAt >= REFRESH_MS);
      else {
        el('heroTemp').textContent = 'กำลังโหลด...';
        el('heroCurrentConditions').textContent = 'กำลังดึงข้อมูลสภาพอากาศล่าสุด';
        el('heroWeatherUpdated').textContent = '';
      }
    }
    // Avoid duplicate requests on re-renders and fast repeated actions.
    const cached = cache.get(id);
    if (changed || !cached || Date.now() - cached.savedAt >= REFRESH_MS)
      fetchWeather(id);
  }

  function init() {
    if (initialized) return;
    initialized = true;
    updateClock();
    clockInterval = setInterval(updateClock, 1000); // One text-only clock, no rendering loop.
    weatherInterval = setInterval(() => {
      if (!document.hidden && currentId) fetchWeather(currentId);
    }, REFRESH_MS);
    el('weatherRefresh')?.addEventListener('click', () => {
      if (currentId) fetchWeather(currentId, true);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        updateClock();
        if (currentId) fetchWeather(currentId);
      }
    });
    window.addEventListener('online', () => { if (currentId) fetchWeather(currentId, true); });
  }

  window.ThaiProvinceAtlasLive = { selectProvince, refresh: () => currentId && fetchWeather(currentId, true), getLocation:(id) => locations[id] ? {...locations[id]} : null, describeWeather };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
