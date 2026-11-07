// A brand's own website, promoted on every video it makes (setting EXTRA_LINK, e.g. "ziggasa.com"):
// one extra line in the description and one on the video's outro.

const PREFIX = 'আরও দেখুন';
const LABEL_MAX = 40;

/** "https://www.Ziggasa.com/" -> "ziggasa.com"; '' when the value is not a plain host name. */
function siteOf(value) {
  const host = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) ? host : '';
}

/** The outro line ("আরও দেখুন: ziggasa.com"), or null without a site or when it would not fit. */
function extraLabel(value) {
  const site = siteOf(value);
  const label = `${PREFIX}: ${site}`;
  return site && label.length <= LABEL_MAX ? label : null;
}

/** The description with the link added above its closing hashtag line (or at the end). Unchanged without a site. */
function withExtraLink(description, value) {
  const site = siteOf(value);
  const text = typeof description === 'string' ? description.trim() : '';
  if (!site) return text;
  const url = `https://${site}`;
  if (text.includes(url)) return text;
  const link = `${PREFIX}: ${url}`;
  const lines = text.split('\n');
  const last = lines[lines.length - 1];
  if (/^#/.test(last)) {
    const before = lines.slice(0, -1).join('\n').trim();
    return `${before ? `${before}\n\n` : ''}${link}\n\n${last}`;
  }
  return text ? `${text}\n\n${link}` : link;
}

module.exports = { siteOf, extraLabel, withExtraLink };
