// Real share links and where they redirected, captured 2026-09-29 by following each
// hop by hand. Each one took a single redirect. Tests use these so they never hit
// the network.

export const GOOGLE_SHORT_LINKS = {
  "https://maps.app.goo.gl/T1mQoo55x2b14Ztr9":
    "https://www.google.com/maps/place/Joe%E2%80%99s+on+Newbury/@42.3505149,-71.0822403,17z/data=!3m2!4b1!5s0x89e37a0ea7031509:0xe1464b180d220687!4m6!3m5!1s0x89e37a0ea68a3447:0x835c54e0d5b428e3!8m2!3d42.350511!4d-71.07966!16s%2Fg%2F1vlzccqj?entry=tts&g_ep=EgoyMDI2MDkyNy4xIPu8ASoASAFQAw%3D%3D&skid=cdcac895-bb7c-4bbd-8c3a-df52d972672c",
  "https://maps.app.goo.gl/1bJbqymfq1AcVN1A8":
    "https://www.google.com/maps/place/Kempegowda+International+Airport+Bengaluru/@13.199915,77.7081008,16z/data=!3m1!4b1!4m6!3m5!1s0x3bae1cfe75446265:0x296c70e9a129418e!8m2!3d13.198909!4d77.7068926!16zL20vMGJmNm15?entry=tts&g_ep=EgoyMDI2MDkyNy4xIPu8ASoASAFQAw%3D%3D&skid=bcf5bb4e-b53c-416d-b650-3fa50702797b",
  "https://maps.app.goo.gl/j4UyLMnTG6VBvonZ9":
    "https://www.google.com/maps/place/Kanha+Tiger+Reserve/@22.2995005,80.5838475,17z/data=!3m1!4b1!4m6!3m5!1s0x3a2a085bc4dd23f3:0x59131aabc7236a4c!8m2!3d22.2994956!4d80.5864278!16zL20vMDZmNHRn?entry=tts&g_ep=EgoyMDI2MDkyNy4xIPu8ASoASAFQAw%3D%3D&skid=d4f68ca9-5f16-47c2-9cd1-38096038da27",
  "https://maps.app.goo.gl/R612eWtEo1khkuae6":
    "https://www.google.com/maps/place/Berkeley+Art+Museum+and+Pacific+Film+Archive/@37.8696837,-122.2481579,14.63z/data=!4m6!3m5!1s0x80857e9d892bc107:0xea2b8511aef1a078!8m2!3d37.8707356!4d-122.2664841!16s%2Fm%2F026stfv?entry=tts&g_ep=EgoyMDI2MDkyNy4xIPu8ASoASAFQAw%3D%3D&skid=a26d33c1-5dda-4f08-b8b7-e29aa31ea256",
  "https://maps.app.goo.gl/EYqwLwSTxiSbskXy5":
    "https://www.google.com/maps/place/Ristorante+Pizzeria+5+Torri/@46.5387485,12.1362459,18.89z/data=!4m6!3m5!1s0x477834309f080753:0x33fd9e736dfbe7b6!8m2!3d46.5387619!4d12.1362378!16s%2Fg%2F1tcwpzjg?entry=tts&g_ep=EgoyMDI2MDkyNy4xIPu8ASoASAFQAw%3D%3D&skid=0037c135-2676-4b7a-9b5b-4f059fe74c27",
} as const;

// Long link pasted as-is (not a short link). The ê is a raw character, and the !4d
// longitude (2.2890529) differs from the @ longitude (2.287592).
export const CREPE_STATION =
  "https://www.google.com/maps/place/Crêpe+Station/@48.8694204,2.287592,17z/data=!4m6!3m5!1s0x47e66fc51ef51247:0xd4910d465c4c5218!8m2!3d48.8694204!4d2.2890529!16s%2Fg%2F11tdf71wd8?entry=ttu&g_ep=EgoyMDI2MDkyNy4xIKXMDSoASAFQAw%3D%3D";

// Apple's new short domain. Each one lands on a place-id-only URL: no name or
// coordinates in the URL (those are read from the page, see apple.ts).
export const APPLE_SHORT_LINKS = {
  "https://maps.apple/p/FC86kf24PkU2.q":
    "https://maps.apple.com/place?place-id=IF0394FBA16E9D470&_provider=9902", // Parque del Oeste, Madrid
  "https://maps.apple/p/KwKxX3hmkLGd3K":
    "https://maps.apple.com/place?place-id=IDBBDD355EAC5EAF5&_provider=9902", // Sushi By M, New York
  "https://maps.apple/p/dzqoFBt_ZqtJDN":
    "https://maps.apple.com/place?place-id=IDE4109562EE17B1C&_provider=9902", // El Capitan, Yosemite
} as const;

// The pages those Apple links land on, trimmed to the tags that matter (captured
// 2026-09-30). The <title> is kept to show it isn't what gets read.
const applePage = (title: string, lat: string, lng: string, ogTitle: string) =>
  `<!DOCTYPE html><html lang="en-US" dir="ltr"><head><meta charset="utf-8"><title>${title}</title>` +
  `<meta property="place:location:latitude" content="${lat}">\n` +
  `<meta property="place:location:longitude" content="${lng}">\n` +
  `<meta property="og:title" content="${ogTitle}">\n</head><body></body></html>`;

export const APPLE_PLACE_PAGES = {
  "https://maps.apple.com/place?place-id=IF0394FBA16E9D470&_provider=9902": applePage(
    "Parque del Oeste in Madrid, Spain - Apple Maps",
    "40.4258461",
    "-3.7205887",
    "Parque del Oeste",
  ),
  "https://maps.apple.com/place?place-id=IDBBDD355EAC5EAF5&_provider=9902": applePage(
    "Sushi By M in New York, NY United States - Apple Maps",
    "40.7266083",
    "-73.9888537",
    "Sushi By M",
  ),
  "https://maps.apple.com/place?place-id=IDE4109562EE17B1C&_provider=9902": applePage(
    "El Capitan in Mariposa County, CA, United States - Apple Maps",
    "37.73431",
    "-119.6376",
    "El Capitan",
  ),
} as const;
