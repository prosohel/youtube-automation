const brands = require('../../server/brands');

/** A brand with the given settings saved into it. */
async function seedBrand(redis, { name = 'Brand', settings = {} } = {}) {
  const brand = await brands.createBrand(redis, { name });
  if (Object.keys(settings).length) await brands.saveBrandSettings(redis, brand.id, settings);
  return brand;
}

module.exports = { seedBrand };
