/**
 * utils/kundliCalculator.js
 *
 * FREE Vedic kundli calculator — koi paid API nahi.
 * Uses `astronomy-engine` (pure JS, MIT license, no native binary — isliye
 * Railway/Render jaise host pe bina headache deploy ho jata hai, jabki
 * `swisseph` npm package ek native C addon hai jo compile karwana padta hai).
 *
 * ⚠️ ASSUMPTIONS (professional-grade nahi, but free + "good enough" hai):
 *   1. Timezone hamesha IST (+5:30) maana hai — agar kabhi non-Indian
 *      users/places aayein to isse dynamic timezone lookup me badalna hoga.
 *   2. Ayanamsa = Lahiri, ek linear approximation se (arc-second level
 *      professional astrology software jaisi precision nahi, lekin rashi/
 *      nakshatra ke liye kaafi accurate).
 *   3. Houses = Whole Sign system (Vedic me sabse common & simplest).
 *   4. Rahu/Ketu = Mean Lunar Node (standard formula, most apps yahi use
 *      karte hain).
 *   5. Kahin bhi save nahi hota — sirf ek function call, result return,
 *      done.
 */

const Astronomy = require('astronomy-engine');

const ZODIAC_SIGNS = [
  'Mesh (Aries)', 'Vrishabh (Taurus)', 'Mithun (Gemini)', 'Kark (Cancer)',
  'Simha (Leo)', 'Kanya (Virgo)', 'Tula (Libra)', 'Vrishchik (Scorpio)',
  'Dhanu (Sagittarius)', 'Makar (Capricorn)', 'Kumbh (Aquarius)', 'Meen (Pisces)',
];

const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta',
  'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
];

const PLANETS = [
  { key: 'Sun', body: Astronomy.Body.Sun, label: 'Surya (Sun)' },
  { key: 'Moon', body: Astronomy.Body.Moon, label: 'Chandra (Moon)' },
  { key: 'Mercury', body: Astronomy.Body.Mercury, label: 'Budh (Mercury)' },
  { key: 'Venus', body: Astronomy.Body.Venus, label: 'Shukra (Venus)' },
  { key: 'Mars', body: Astronomy.Body.Mars, label: 'Mangal (Mars)' },
  { key: 'Jupiter', body: Astronomy.Body.Jupiter, label: 'Guru (Jupiter)' },
  { key: 'Saturn', body: Astronomy.Body.Saturn, label: 'Shani (Saturn)' },
];

const IST_OFFSET_HOURS = 5.5;

// ─── Geocode "City, State" → { lat, lon } using free OSM Nominatim ─────────
// No API key needed. Nominatim usage policy: 1 request/sec, must send a
// real User-Agent. Har call live hota hai, kahin store nahi hota.
async function geocodePlace(placeOfBirth) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(placeOfBirth)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'RightAstroApp/1.0 (kundli-generator)' },
  });
  if (!res.ok) throw new Error('Geocoding failed');
  const data = await res.json();
  if (!data?.length) {
    // Fallback: agar city nahi mili to India ka center le lo (Nagpur ke
    // paas) taaki calculation crash na ho — chart approximate rahega.
    return { lat: 21.1458, lon: 79.0882, approx: true };
  }
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), approx: false };
}

// ─── Parse "DD/MM/YYYY" + "HH:MM AM/PM" (IST) → UTC Date object ───────────
function toUtcDate(dob, timeOfBirth) {
  const [d, m, y] = (dob || '').split('/').map((n) => parseInt(n, 10));
  if (!d || !m || !y) throw new Error('Invalid dob format, expected DD/MM/YYYY');

  let hh = 12, mm = 0; // agar time of birth nahi diya, noon assume karo
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

  // IST local time → UTC (IST = UTC + 5:30)
  const istMillis = Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_HOURS * 3600 * 1000;
  return new Date(istMillis);
}

// ─── Ayanamsa (Lahiri) — linear approximation ──────────────────────────────
// Lahiri ayanamsa at J2000 (year 2000) ≈ 23.85°, precession rate ≈
// 50.29 arcsec/year = 0.013969°/year. Arc-second precision nahi, but
// rashi/nakshatra placement ke liye kaafi accurate hai.
function lahiriAyanamsa(date) {
  const year = date.getUTCFullYear() + date.getUTCMonth() / 12;
  return 23.85 + (year - 2000) * 0.013969;
}

// ─── Mean obliquity of the ecliptic (standard polynomial, no lib needed) ──
function meanObliquity(julianCenturiesT) {
  const T = julianCenturiesT;
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
  const span = 360 / 27; // 13°20'
  const idx = Math.floor(norm360(siderealLon) / span);
  const posInNak = norm360(siderealLon) % span;
  const pada = Math.floor(posInNak / (span / 4)) + 1; // 1–4
  return { name: NAKSHATRAS[idx], pada };
}

// ─── Ascendant (Lagna) — tropical, then converted to sidereal ─────────────
function calcAscendantTropical(utcDate, lat, lon) {
  const gstHours = Astronomy.SiderealTime(utcDate); // Greenwich sidereal time, in hours
  const lstHours = norm360((gstHours + lon / 15) * 15) / 15; // local sidereal time, hours
  const ramc = lstHours * 15; // Right Ascension of Midheaven, degrees

  const jd = toJulianDate(utcDate);
  const T = (jd - 2451545.0) / 36525;
  const eps = deg2rad(meanObliquity(T));
  const ramcRad = deg2rad(ramc);
  const latRad = deg2rad(lat);

  const y = -Math.cos(ramcRad);
  const x = Math.sin(ramcRad) * Math.cos(eps) + Math.tan(latRad) * Math.sin(eps);
  const ascTropical = norm360(rad2deg(Math.atan2(y, x)));
  return ascTropical;
}

// ─── Mean lunar node (Rahu), tropical longitude ────────────────────────────
function meanRahuTropical(utcDate) {
  const jd = toJulianDate(utcDate);
  const T = (jd - 2451545.0) / 36525;
  const omega =
    125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T ** 3) / 467441 - (T ** 4) / 60616000;
  return norm360(omega);
}

// ─── Main entry point ──────────────────────────────────────────────────────
// birthDetails = { name, dob, timeOfBirth, placeOfBirth }
// returns full chart — NOTHING is persisted anywhere.
async function generateKundli(birthDetails) {
  const { dob, timeOfBirth, placeOfBirth } = birthDetails || {};
  if (!dob || !placeOfBirth) {
    throw new Error('dob aur placeOfBirth required hain kundli banane ke liye');
  }

  const utcDate = toUtcDate(dob, timeOfBirth);
  const { lat, lon, approx } = await geocodePlace(placeOfBirth);
  const ayanamsa = lahiriAyanamsa(utcDate);

  // Ascendant
  const ascTropical = calcAscendantTropical(utcDate, lat, lon);
  const ascSidereal = norm360(ascTropical - ayanamsa);
  const ascSignIdx = signIndex(ascSidereal);

  // Planets via astronomy-engine GeoVector → Ecliptic
  const planets = PLANETS.map(({ key, body, label }) => {
    const vector = Astronomy.GeoVector(body, utcDate, true);
    const ecliptic = Astronomy.Ecliptic(vector);
    const sidereal = norm360(ecliptic.elon - ayanamsa);
    const signIdx = signIndex(sidereal);
    const houseNum = ((signIdx - ascSignIdx + 12) % 12) + 1; // whole-sign house
    const nak = nakshatraOf(sidereal);
    return {
      key,
      label,
      longitude: parseFloat(sidereal.toFixed(2)),
      sign: ZODIAC_SIGNS[signIdx],
      signIndex: signIdx,
      degreeInSign: parseFloat(degreeInSign(sidereal).toFixed(2)),
      house: houseNum,
      nakshatra: nak.name,
      pada: nak.pada,
    };
  });

  // Rahu / Ketu (mean node)
  const rahuTropical = meanRahuTropical(utcDate);
  const rahuSidereal = norm360(rahuTropical - ayanamsa);
  const ketuSidereal = norm360(rahuSidereal + 180);

  [
    { key: 'Rahu', label: 'Rahu', sidereal: rahuSidereal },
    { key: 'Ketu', label: 'Ketu', sidereal: ketuSidereal },
  ].forEach(({ key, label, sidereal }) => {
    const signIdx = signIndex(sidereal);
    const houseNum = ((signIdx - ascSignIdx + 12) % 12) + 1;
    const nak = nakshatraOf(sidereal);
    planets.push({
      key,
      label,
      longitude: parseFloat(sidereal.toFixed(2)),
      sign: ZODIAC_SIGNS[signIdx],
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
      sign: ZODIAC_SIGNS[ascSignIdx],
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
      note: 'Free calculation (astronomy-engine + Lahiri approx) — professional Swiss Ephemeris jitni arc-second precision nahi, but general reading ke liye reliable.',
    },
  };
}

module.exports = { generateKundli };