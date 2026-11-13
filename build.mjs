// Builds thethrivegathering.com from content/*.json + src/ into dist/.
// Netlify runs this on every save from Pages CMS (see netlify.toml).
import fs from "node:fs";
import path from "node:path";
import nunjucks from "nunjucks";
import sharp from "sharp";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "public");
const SITE = { url: "https://www.thethrivegathering.com" };
const TZ = "America/Chicago";

const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const C = Object.fromEntries(
  ["settings", "top", "theme", "speaker", "details", "parking", "scholarships", "faq", "footer"]
    .map(n => [n, read(`content/${n}.json`)])
);

/* ---------- helpers ---------- */
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Tiny inline formatting for staff: **bold**, *italic*, [link text](url) and line breaks.
// The last two words are tied together so a paragraph never ends on one orphaned word.
const md = t => esc(t)
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|tel:[^)\s]+|\/[^)\s]*|#[^)\s]*)\)/g, (_, txt, url) =>
    url.startsWith("http") ? `<a href="${url}" target="_blank" rel="noopener">${txt}</a>` : `<a href="${url}">${txt}</a>`)
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\*([^*]+)\*/g, "<em>$1</em>")
  .replace(/\n/g, "<br>")
  .replace(/ ([^\s<>]{1,14})((?:<\/[a-z]+>)*)$/i, "&nbsp;$1$2");
const plain = t => String(t ?? "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*+([^*]+)\*+/g, "$1").replace(/\n/g, " ");
const jsonscript = v => JSON.stringify(v, null, 2).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

function parseTime(t) {
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (!m) throw new Error(`Time "${t}" should look like 7:00 PM`);
  let h = +m[1] % 12; if (/p/i.test(m[3])) h += 12;
  return { h, min: +m[2] };
}
// Offset of America/Chicago on a given local date/time, e.g. "-06:00"
function chicagoOffset(y, mo, d, h, min) {
  const guess = Date.UTC(y, mo - 1, d, h, min);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess)).reduce((a, p) => (a[p.type] = p.value, a), {});
  const offMin = Math.round((Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - guess) / 60000);
  const sign = offMin <= 0 ? "-" : "+", a = Math.abs(offMin);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}
const pad = n => String(n).padStart(2, "0");
const isoAt = (date, time) => {
  const [y, mo, d] = String(date).split("-").map(Number);
  const t = parseTime(time);
  return `${y}-${pad(mo)}-${pad(d)}T${pad(t.h)}:${pad(t.min)}:00${chicagoOffset(y, mo, d, t.h, t.min)}`;
};

/* ---------- build ---------- */
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(PUBLIC, DIST, { recursive: true });

const publicPath = p => path.join(PUBLIC, decodeURI(p).replace(/^\//, ""));
const photo = await sharp(publicPath(C.speaker.photo)).metadata();

const S = C.settings;
const abs = p => p.startsWith("http") ? p : SITE.url + (p.startsWith("/") ? p : "/" + p);
const event = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: S.eventName,
  startDate: isoAt(S.startDate, S.startTime),
  endDate: isoAt(S.endDate, S.endTime),
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  eventStatus: "https://schema.org/EventScheduled",
  location: {
    "@type": "Place",
    name: "Christ Community Church, Worship Center",
    address: { "@type": "PostalAddress", streetAddress: "404 S 108th Ave", addressLocality: "Omaha", addressRegion: "NE", postalCode: "68154", addressCountry: "US" },
  },
  image: [abs(S.shareImage)],
  description: S.eventDescription,
  performer: { "@type": "Person", name: C.speaker.name },
  organizer: { "@type": "Organization", name: "Christ Community Church", url: "https://cccomaha.org" },
  offers: { "@type": "Offer", price: String(S.price), priceCurrency: "USD", availability: "https://schema.org/InStock", url: S.ticketUrl },
};
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: (C.faq.items || []).map(f => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: plain(f.answer) } })),
};

const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(ROOT, "src")), { autoescape: true });
env.addFilter("md", t => new nunjucks.runtime.SafeString(md(t)));
env.addFilter("jsonscript", v => new nunjucks.runtime.SafeString(jsonscript(v)));
env.addFilter("file", f => new nunjucks.runtime.SafeString(fs.readFileSync(path.join(ROOT, "src", f), "utf8")));

const html = env.render("index.njk", {
  site: SITE, ...C, event, faqSchema,
  photo: { width: photo.width, height: photo.height },
  shareImageAbs: abs(S.shareImage),
});
fs.writeFileSync(path.join(DIST, "index.html"), html);
console.log(`Built thethrivegathering.com: ${(C.faq.items || []).length} FAQs, event ${event.startDate} to ${event.endDate}.`);
