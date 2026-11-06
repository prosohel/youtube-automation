const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const { seedBrand } = require('./helpers/brands');
const B = require('../server/brands');
const S = require('../server/settings');
const store = require('../server/store');

test.after(closeAll);

const pause = () => new Promise((res) => setTimeout(res, 5)); // createdAt orders brands, so keep creates apart

test('brand settings never fall back to the shared hash or another brand', async () => {
  const r = await freshRedis();
  // A pre-move install: brand keys sit in the shared hash.
  await r.hset('settings', { YOUTUBE_TOKEN: JSON.stringify({ shared: 1 }), LANGUAGE: JSON.stringify('Bangla') });
  const a = await seedBrand(r, { name: 'A', settings: { YOUTUBE_TOKEN: { a: 1 } } });
  const b = await seedBrand(r, { name: 'B' });
  assert.deepEqual((await B.brandSettings(r, a.id)).YOUTUBE_TOKEN, { a: 1 });
  const sb = await B.brandSettings(r, b.id);
  assert.equal(sb.YOUTUBE_TOKEN, null);
  assert.equal(sb.LANGUAGE, 'English');
});

test('shared keys come from the shared settings, brand keys from the brand', async () => {
  const r = await freshRedis();
  await S.saveSettings(r, { ELEVENLABS_API_KEY: 'k_shared' });
  const a = await seedBrand(r, { name: 'A', settings: { LANGUAGE: 'Bangla' } });
  const s = await B.brandSettings(r, a.id);
  assert.equal(s.ELEVENLABS_API_KEY, 'k_shared');
  assert.equal(s.LANGUAGE, 'Bangla');
});

test('an unknown brand is a setup error', async () => {
  const r = await freshRedis();
  await assert.rejects(B.brandSettings(r, 'b_nope'), (e) => e.config === true && /not found/i.test(e.message));
});

test("brand and shared settings refuse each other's keys", async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A' });
  await assert.rejects(B.saveBrandSettings(r, a.id, { ELEVENLABS_API_KEY: 'x' }), /shared/i);
  assert.equal((await S.loadSettings(r)).ELEVENLABS_API_KEY, '');
});

test('brand settings use the same patch rules as shared ones', async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A', settings: { YOUTUBE_TOKEN: { t: 1 }, NICHE: 'cats' } });
  let s = await B.saveBrandSettings(r, a.id, { YOUTUBE_TOKEN: '', NICHE: 'dogs' });
  assert.deepEqual(s.YOUTUBE_TOKEN, { t: 1 }); // blank secret = unchanged
  assert.equal(s.NICHE, 'dogs');
  s = await B.saveBrandSettings(r, a.id, { YOUTUBE_TOKEN: null, NICHE: null });
  assert.equal(s.YOUTUBE_TOKEN, null); // null clears a secret
  assert.equal(s.NICHE, 'technology tips'); // null resets to the default
  await assert.rejects(B.saveBrandSettings(r, a.id, { VIDEO_FORMAT: 'square' }), /Invalid value/);
});

test('a new brand copies settings but no credentials or account ids', async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A', settings: { LANGUAGE: 'Bangla', YOUTUBE_TOKEN: { a: 1 }, FACEBOOK_PAGE_ID: '42' } });
  await B.setAccount(r, a.id, 'youtube', { id: 'UC1', name: 'One' });
  const copy = await B.createBrand(r, { name: 'Copy', copyFrom: a.id });
  const s = await B.brandSettings(r, copy.id);
  assert.equal(s.LANGUAGE, 'Bangla');
  assert.equal(s.YOUTUBE_TOKEN, null);
  assert.equal(s.FACEBOOK_PAGE_ID, '');
  assert.deepEqual(copy.accounts, {});
  assert.deepEqual((await B.getBrand(r, copy.id)).accounts, {});
});

test('a blank brand name is refused', async () => {
  const r = await freshRedis();
  await assert.rejects(B.createBrand(r, { name: '  ' }), /name/i);
});

test('an account belongs to one brand', async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A' });
  const b = await seedBrand(r, { name: 'B' });
  await B.setAccount(r, a.id, 'youtube', { id: 'UC1', name: 'One' });
  await assert.rejects(B.setAccount(r, b.id, 'youtube', { id: 'UC1', name: 'One' }), (e) => e.conflict === true && /Already connected to brand "A"/.test(e.message));
  await B.setAccount(r, a.id, 'youtube', { id: 'UC1', name: 'One again' }); // the same brand again is fine
  await B.setAccount(r, a.id, 'tiktok', { username: 'one' });
  await assert.rejects(B.setAccount(r, b.id, 'tiktok', { username: 'one' }), /Already connected to brand "A"/);
  await B.saveBrandSettings(r, a.id, { FACEBOOK_PAGE_ID: '42', INSTAGRAM_USER_ID: '7' });
  assert.deepEqual((await B.getBrand(r, a.id)).accounts.facebook, { id: '42' });
  assert.deepEqual((await B.getBrand(r, a.id)).accounts.instagram, { id: '7' });
  await assert.rejects(B.saveBrandSettings(r, b.id, { FACEBOOK_PAGE_ID: '42' }), /Already used by brand "A"/);
  await assert.rejects(B.saveBrandSettings(r, b.id, { INSTAGRAM_USER_ID: '7' }), /Already used by brand "A"/);
  assert.equal((await B.brandSettings(r, b.id)).FACEBOOK_PAGE_ID, ''); // nothing was written
  await B.saveBrandSettings(r, a.id, { FACEBOOK_PAGE_ID: '' }); // clearing releases the page
  assert.equal((await B.getBrand(r, a.id)).accounts.facebook, undefined);
  await B.saveBrandSettings(r, b.id, { FACEBOOK_PAGE_ID: '42' });
});

test("the move turns today's setup into the first brand, once", async () => {
  const r = await freshRedis();
  await r.hset('settings', {
    LANGUAGE: JSON.stringify('Bangla'),
    YOUTUBE_TOKEN: JSON.stringify({ refresh_token: 'rt' }),
    ELEVENLABS_API_KEY: JSON.stringify('k_shared'),
  });
  const v1 = await store.createVideo(r, { topic: 'one' });
  const v2 = await store.createVideo(r, { topic: 'two' });
  const rule = await store.saveRule(r, { name: 'daily' });

  const first = await B.ensureBrands(r);
  assert.equal(first.created, true);
  const all = await B.listBrands(r);
  assert.equal(all.length, 1);
  assert.equal(all[0].name, 'My channel');
  assert.equal(all[0].active, true);
  assert.equal(all[0].id, first.brandId);
  assert.deepEqual(all[0].accounts.youtube, { id: null, name: null });

  const s = await B.brandSettings(r, first.brandId);
  assert.deepEqual(s.YOUTUBE_TOKEN, { refresh_token: 'rt' });
  assert.equal(s.LANGUAGE, 'Bangla');
  const shared = await r.hgetall('settings');
  assert.equal(shared.YOUTUBE_TOKEN, undefined);
  assert.equal(shared.LANGUAGE, undefined);
  assert.ok(shared.ELEVENLABS_API_KEY);
  for (const id of [v1.id, v2.id]) assert.equal((await store.getVideo(r, id)).brandId, first.brandId);
  assert.equal((await store.listRules(r)).find((x) => x.id === rule.id).brandId, first.brandId);

  const second = await B.ensureBrands(r);
  assert.equal(second.created, false);
  assert.equal(second.brandId, first.brandId);
  assert.equal((await B.listBrands(r)).length, 1);
});

test('the move keeps a brandId that is already set and works on an empty install', async () => {
  const r = await freshRedis();
  const v = await store.createVideo(r, { topic: 'x' });
  await store.updateVideo(r, v.id, { brandId: 'b_other' });
  const out = await B.ensureBrands(r);
  assert.equal(out.created, true);
  assert.equal((await store.getVideo(r, v.id)).brandId, 'b_other');
  assert.deepEqual((await B.getBrand(r, out.brandId)).accounts, {}); // no token, no account
});

test('archiving switches a brand off; deleting refuses a brand with videos or rules', async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A', settings: { LANGUAGE: 'Bangla' } });
  assert.equal(a.active, true);
  const archived = await B.updateBrand(r, a.id, { archived: true });
  assert.equal(archived.archived, true);
  assert.equal(archived.active, false);
  assert.deepEqual((await B.listBrands(r)).map((x) => x.id), []);
  assert.deepEqual((await B.listBrands(r, { includeArchived: true })).map((x) => x.id), [a.id]);
  const back = await B.updateBrand(r, a.id, { name: 'A2', archived: false, active: true });
  assert.equal(back.name, 'A2');
  assert.equal(back.active, true);

  const v = await store.createVideo(r, { topic: 't' });
  await store.updateVideo(r, v.id, { brandId: a.id });
  await assert.rejects(B.deleteBrand(r, a.id), (e) => e.status === 409 && e.message === 'Brand "A2" still has videos or rules; archive it instead');
  await store.deleteVideo(r, v.id);
  await store.saveRule(r, { name: 'rule', brandId: a.id });
  await assert.rejects(B.deleteBrand(r, a.id), (e) => e.status === 409);

  const empty = await seedBrand(r, { name: 'Empty', settings: { LANGUAGE: 'Hindi' } });
  await B.deleteBrand(r, empty.id);
  assert.equal(await B.getBrand(r, empty.id), null);
  assert.equal(await r.exists(`brand:${empty.id}:settings`), 0);
});

test('brands are listed oldest first', async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A' });
  await pause();
  const b = await seedBrand(r, { name: 'B' });
  await pause();
  const c = await seedBrand(r, { name: 'C' });
  assert.deepEqual((await B.listBrands(r)).map((x) => x.id), [a.id, b.id, c.id]);
});

test('a move that died before backfilling is finished by the next call', async () => {
  const r = await freshRedis();
  const first = await B.ensureBrands(r); // the flag and the brand exist
  // As if the first run died before it got to these: a video and a rule with no brand.
  const v = await store.createVideo(r, { topic: 'late' });
  const rule = await store.saveRule(r, { name: 'late rule' });
  const again = await B.ensureBrands(r);
  assert.equal(again.created, false);
  assert.equal(again.brandId, first.brandId);
  assert.equal((await store.getVideo(r, v.id)).brandId, first.brandId);
  assert.equal((await store.listRules(r)).find((x) => x.id === rule.id).brandId, first.brandId);
  assert.equal((await B.listBrands(r)).length, 1);
});

test('a move that died right after the flag still creates the brand once', async () => {
  const r = await freshRedis();
  await r.set('brands:migrated', 'b_firstid'); // the flag, but no brand yet
  await r.hset('settings', { LANGUAGE: JSON.stringify('Bangla'), YOUTUBE_TOKEN: JSON.stringify({ t: 1 }) });
  const v = await store.createVideo(r, { topic: 'x' });
  const out = await B.ensureBrands(r);
  assert.equal(out.created, false);
  assert.equal(out.brandId, 'b_firstid');
  assert.deepEqual((await B.listBrands(r)).map((b) => b.id), ['b_firstid']);
  assert.equal((await B.brandSettings(r, 'b_firstid')).LANGUAGE, 'Bangla');
  assert.equal(await r.hget('settings', 'LANGUAGE'), null);
  assert.equal((await store.getVideo(r, v.id)).brandId, 'b_firstid');
});

test('the flag naming a brand that is gone falls back to the oldest brand', async () => {
  const r = await freshRedis();
  const first = await B.ensureBrands(r);
  const other = await seedBrand(r, { name: 'Other' });
  await B.deleteBrand(r, first.brandId);
  const v = await store.createVideo(r, { topic: 'x' });
  const out = await B.ensureBrands(r);
  assert.equal(out.brandId, other.id);
  assert.equal((await store.getVideo(r, v.id)).brandId, other.id);
  assert.equal((await B.listBrands(r)).length, 1);
});

test('later calls never copy the shared hash again', async () => {
  const r = await freshRedis();
  await r.hset('settings', { LANGUAGE: JSON.stringify('Bangla') });
  const first = await B.ensureBrands(r);
  await B.saveBrandSettings(r, first.brandId, { LANGUAGE: 'Hindi' }); // the brand's newer value
  await r.hset('settings', { LANGUAGE: JSON.stringify('Tamil') }); // a runtime caller that still writes the shared hash
  await B.ensureBrands(r);
  assert.equal((await B.brandSettings(r, first.brandId)).LANGUAGE, 'Hindi');
  assert.equal(await r.hget('settings', 'LANGUAGE'), JSON.stringify('Tamil'));
});

test('two processes starting at once create one brand', async () => {
  const r = await freshRedis();
  await r.hset('settings', { YOUTUBE_TOKEN: JSON.stringify({ t: 1 }) });
  const v = await store.createVideo(r, { topic: 'x' });
  const outs = await Promise.all([B.ensureBrands(r), B.ensureBrands(r), B.ensureBrands(r)]);
  assert.equal(outs.filter((o) => o.created).length, 1);
  assert.equal(new Set(outs.map((o) => o.brandId)).size, 1);
  const all = await B.listBrands(r);
  assert.equal(all.length, 1);
  assert.deepEqual(all[0].accounts.youtube, { id: null, name: null });
  assert.deepEqual((await B.brandSettings(r, all[0].id)).YOUTUBE_TOKEN, { t: 1 });
  assert.equal((await store.getVideo(r, v.id)).brandId, all[0].id);
});

test('two account updates at once on one brand both stay', async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A' });
  await Promise.all([
    B.setAccount(r, a.id, 'youtube', { id: 'UC1', name: 'One' }),
    B.setAccount(r, a.id, 'tiktok', { username: 'one' }),
    B.saveBrandSettings(r, a.id, { FACEBOOK_PAGE_ID: '42' }),
    B.updateBrand(r, a.id, { name: 'A renamed' }),
  ]);
  const got = await B.getBrand(r, a.id);
  assert.deepEqual(got.accounts, { youtube: { id: 'UC1', name: 'One' }, tiktok: { username: 'one' }, facebook: { id: '42' } });
  assert.equal(got.name, 'A renamed');
});
