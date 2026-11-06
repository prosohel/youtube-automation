// Number text for the graphics. Pure (no Remotion imports) so Node tests can load it.

/** "70%" -> { prefix, num, decimals, suffix, useComma }; null when the value has no ASCII number. */
export const parseStat = (value) => {
  const m = String(value).match(/^(\D*)([\d.,]+)(.*)$/);
  if (!m) return null;
  const num = parseFloat(m[2].replace(/,/g, ''));
  if (Number.isNaN(num)) return null;
  const decimals = (m[2].split('.')[1] || '').length;
  return { prefix: m[1], num, decimals, suffix: m[3], useComma: m[2].includes(',') };
};

/** The value counted up to t (0..1, eased). Shown as written when the count-up can't end on exactly this text. */
export const countUp = (value, t) => {
  const stat = parseStat(value);
  if (!stat) return value;
  const at = (k) => {
    let txt = (stat.num * k).toFixed(stat.decimals);
    if (stat.useComma) txt = Number(txt).toLocaleString('en-US', { minimumFractionDigits: stat.decimals });
    return `${stat.prefix}${txt}${stat.suffix}`;
  };
  if (at(1) !== value) return value; // e.g. lakh grouping "1,20,000" would end as "120,000"
  return at(1 - Math.pow(1 - t, 3));
};

/** "৭০" + "%" -> "৭০%"; "১২" + "লাখ" -> "১২ লাখ". */
export const withUnit = (shown, unit) => (!unit ? shown : /^[%‰°]/.test(unit) ? `${shown}${unit}` : `${shown} ${unit}`);
