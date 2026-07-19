/**
 * utils/kundliCalculator.js — v2 (accuracy fix + Hindi labels)
 *
 * FREE Vedic kundli calculator — koi paid API nahi.
 * Uses `astronomy-engine` (pure JS, MIT license, no native binary).
 *
 * 🔧 FIX vs v1: pehle `Astronomy.GeoVector()` + `Astronomy.Ecliptic()` use
 * kiya tha, jo J2000 (year-2000-fixed) frame me longitude deta hai — isse
 * purani birth dates ke liye systematic error aata tha (jitni date purani,
 * utna zyada error — sign-boundary ke paas planet galat rashi me chala
 * jaata tha). Ab `Astronomy.EclipticLongitude(body, date)` use kar rahe
 * hain jo seedha "true ecliptic OF DATE" longitude deta hai — yehi
 * astrology calculations ke liye sahi tareeka hai.
 *
 * ⚠️ Phir bhi ye professional Swiss-Ephemeris jaisi arc-second precision
 * nahi hai — but ab sign/nakshatra/house level pe reliably accurate hai.
 *
 * ASSUMPTIONS:
 *   1. Timezone hamesha IST (+5:30)
 *   2. Ayanamsa = Lahiri, calibrated linear formula (2000 CE ≈ 23°51')
 *   3. Houses = Whole Sign system
 *   4. Rahu/Ketu = Mean Lunar Node
 *   5. Kahin save nahi hoti — sirf compute + return
 */

const Astronomy = require('astronomy-engine');

const RASHI = [
  'मेष', 'वृषभ', 'मिथुन', 'कर्क', 'सिंह', 'कन्या',
  'तुला', 'वृश्चिक', 'धनु', 'मकर', 'कुंभ', 'मीन',
];

const NAKSHATRA = [
  'अश्विनी', 'भरणी', 'कृत्तिका', 'रोहिणी', 'मृगशिरा', 'आर्द्रा',
  'पुनर्वसु', 'पुष्य', 'आश्लेषा', 'मघा', 'पूर्वा फाल्गुनी', 'उत्तरा फाल्गुनी',
  'हस्त', 'चित्रा', 'स्वाति', 'विशाखा', 'अनुराधा', 'ज्येष्ठा',
  'मूल', 'पूर्वाषाढ़ा', 'उत्तराषाढ़ा', 'श्रवण', 'धनिष्ठा',
  'शतभिषा', 'पूर्वा भाद्रपद', 'उत्तरा भाद्रपद', 'रेवती',
];

const PLANETS = [
  { key: 'Sun', body: Astronomy.Body.Sun, label: 'सूर्य' },
  { key: 'Moon', body: Astronomy.Body.Moon, label: 'चंद्र' },
  { key: 'Mercury', body: Astronomy.Body.Mercury, label: 'बुध' },
  { key: 'Venus', body: Astronomy.Body.Venus, label: 'शुक्र' },
  { key: 'Mars', body: Astronomy.Body.Mars, label: 'मंगल' },
  { key: 'Jupiter', body: Astronomy.Body.Jupiter, label: 'गुरु' },
  { key: 'Saturn', body: Astronomy.Body.Saturn, label: 'शनि' },
];

const IST_OFFSET_HOURS = 5.5;

// ─── Geocode "City, State" → { lat, lon } free OSM Nominatim ──────────────
async function geocodePlace(placeOfBirth) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(placeOfBirth)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'RightAstroApp/1.0 (kundli-generator)' },
  });
  if (!res.ok) throw new Error('Geocoding fail ho gaya');
  const data = await res.json();
  if (!data?.length) {
    return { lat: 21.1458, lon: 79.0882, approx: true }; // India center fallback
  }
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), approx: false };
}

// ─── Parse "DD/MM/YYYY" + "HH:MM AM/PM" (IST) → UTC Date ──────────────────
function toUtcDate(dob, timeOfBirth) {
  const [d, m, y] = (dob || '').split('/').map((n) => parseInt(n, 10));
  if (!d || !m || !y) throw new Error('dob format galat hai, DD/MM/YYYY chahiye');

  let hh = 12, mm = 0;
  if (timeOfBirth && timeOfBirth.trim()) {
    const match = timeOfBirth.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
      hh = parseInt(match[1], 10);
      mm = parseInt(match[2], 10);
      const meridian = match[3]?.toUpperCase();
      if (meridian === 'PM' && hh !== 12) hh += 12;
      if (meridian === 'AM' && hh === 12) hh = 0;
    }
  }

  const istMillis = Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_HOURS * 3600 * 1000;
  return new Date(istMillis);
}

// ─── Ayanamsa (Lahiri) — calibrated linear approx (2000 CE ref = 23.85°) ──
function lahiriAyanamsa(date) {
  const year = date.getUTCFullYear() + date.getUTCMonth() / 12;
  return 23.85 + (year - 2000) * 0.013969;
}

function meanObliquity(T) {
  return 23.439291 - 0.0130042 * T - 0.00000016 * T * T + 0.000000504 * T * T * T;
}

function toJulianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

const norm360 = (deg) => ((deg % 360) + 360) % 360;
const deg2rad = (d) => (d * Math.PI) / 180;
const rad2deg = (r) => (r * 180) / Math.PI;

function signIndex(siderealLon) {
  return Math.floor(norm360(siderealLon) / 30);
}
function degreeInSign(siderealLon) {
  return norm360(siderealLon) % 30;
}
function nakshatraOf(siderealLon) {
  const span = 360 / 27;
  const idx = Math.floor(norm360(siderealLon) / span);
  const posInNak = norm360(siderealLon) % span;
  const pada = Math.floor(posInNak / (span / 4)) + 1;
  return { name: NAKSHATRA[idx], pada };
}

// ─── Ascendant (Lagna) — tropical of-date, phir sidereal me convert ───────
function calcAscendantTropical(utcDate, lat, lon) {
  const gstHours = Astronomy.SiderealTime(utcDate);
  const lstHours = norm360((gstHours + lon / 15) * 15) / 15;
  const ramc = lstHours * 15;

  const jd = toJulianDate(utcDate);
  const T = (jd - 2451545.0) / 36525;
  const eps = deg2rad(meanObliquity(T));
  const ramcRad = deg2rad(ramc);
  const latRad = deg2rad(lat);

  const y = -Math.cos(ramcRad);
  const x = Math.sin(ramcRad) * Math.cos(eps) + Math.tan(latRad) * Math.sin(eps);
  return norm360(rad2deg(Math.atan2(y, x)));
}

function meanRahuTropical(utcDate) {
  const jd = toJulianDate(utcDate);
  const T = (jd - 2451545.0) / 36525;
  const omega =
    125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T ** 3) / 467441 - (T ** 4) / 60616000;
  return norm360(omega);
}

// ─── Main entry point ──────────────────────────────────────────────────────
async function generateKundli(birthDetails) {
  const { dob, timeOfBirth, placeOfBirth } = birthDetails || {};
  if (!dob || !placeOfBirth) {
    throw new Error('kundli banane ke liye dob aur placeOfBirth chahiye');
  }

  const utcDate = toUtcDate(dob, timeOfBirth);
  const { lat, lon, approx } = await geocodePlace(placeOfBirth);
  const ayanamsa = lahiriAyanamsa(utcDate);

  const ascTropical = calcAscendantTropical(utcDate, lat, lon);
  const ascSidereal = norm360(ascTropical - ayanamsa);
  const ascSignIdx = signIndex(ascSidereal);

  // ✅ FIX: EclipticLongitude(body, date) → true ecliptic OF DATE longitude
  // (pehle GeoVector+Ecliptic se J2000-fixed frame aa raha tha, jo purani
  // dates ke liye galat sign de sakta tha)
  const planets = PLANETS.map(({ key, body, label }) => {
    const tropicalLon = Astronomy.EclipticLongitude(body, utcDate);
    const sidereal = norm360(tropicalLon - ayanamsa);
    const signIdx = signIndex(sidereal);
    const houseNum = ((signIdx - ascSignIdx + 12) % 12) + 1;
    const nak = nakshatraOf(sidereal);
    return {
      key,
      label,
      longitude: parseFloat(sidereal.toFixed(2)),
      sign: RASHI[signIdx],
      signIndex: signIdx,
      degreeInSign: parseFloat(degreeInSign(sidereal).toFixed(2)),
      house: houseNum,
      nakshatra: nak.name,
      pada: nak.pada,
    };
  });

  const rahuTropical = meanRahuTropical(utcDate);
  const rahuSidereal = norm360(rahuTropical - ayanamsa);
  const ketuSidereal = norm360(rahuSidereal + 180);

  [
    { key: 'Rahu', label: 'राहु', sidereal: rahuSidereal },
    { key: 'Ketu', label: 'केतु', sidereal: ketuSidereal },
  ].forEach(({ key, label, sidereal }) => {
    const signIdx = signIndex(sidereal);
    const houseNum = ((signIdx - ascSignIdx + 12) % 12) + 1;
    const nak = nakshatraOf(sidereal);
    planets.push({
      key,
      label,
      longitude: parseFloat(sidereal.toFixed(2)),
      sign: RASHI[signIdx],
      signIndex: signIdx,
      degreeInSign: parseFloat(degreeInSign(sidereal).toFixed(2)),
      house: houseNum,
      nakshatra: nak.name,
      pada: nak.pada,
    });
  });

  const moon = planets.find((p) => p.key === 'Moon');

  return {
    ascendant: {
      sign: RASHI[ascSignIdx],
      signIndex: ascSignIdx,
      degreeInSign: parseFloat(degreeInSign(ascSidereal).toFixed(2)),
    },
    moonSign: moon?.sign,
    nakshatra: moon ? { name: moon.nakshatra, pada: moon.pada } : null,
    planets,
    meta: {
      ayanamsaUsed: parseFloat(ayanamsa.toFixed(4)),
      houseSystem: 'whole-sign',
      geocodedApprox: approx || false,
      note: 'Free calculation (astronomy-engine, true-of-date + Lahiri ayanamsa) — Swiss Ephemeris jitni arc-second precision nahi, lekin rashi/bhaav/nakshatra ke liye reliable hai.',
    },
  };
}

module.exports = { generateKundli };