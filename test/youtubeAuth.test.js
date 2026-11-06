const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const settings = require('../server/settings');
const brands = require('../server/brands');
const { seedBrand } = require('./helpers/brands');
const { authUrl, handleCallback } = require('../server/youtubeAuth');

test.after(closeAll);

const CLIENT = { installed: { client_id: 'cid.apps.googleusercontent.com', client_secret: 'csec' } };
const REDIRECT = 'http://localhost:3000/oauth2callback';

// Stubs only: no call here reaches Google. A code "x" is exchanged for the token { refresh_token: 'rt-x' }.
const makeClient = () => ({ getToken: async (code) => ({ tokens: { refresh_token: `rt-${code}` } }) });
/** channelOf stub: the channel each refresh token posts to. A token not listed has no channel to read (the lookup fails). */
const channels = (byToken) => async (ctx) => {
  const ch = byToken[ctx.settings.YOUTUBE_TOKEN.refresh_token];
  if (ch === undefined) throw new Error('invalid_grant');
  return ch;
};
const UC1 = { id: 'UC1', name: 'One' };
const UC2 = { id: 'UC2', name: 'Two' };

async function boot() {
  const r = await freshRedis();
  await settings.saveSettings(r, { YOUTUBE_CLIENT_SECRET: CLIENT });
  return r;
}
const tokenOf = async (r, brand) => (await brands.brandSettings(r, brand.id)).YOUTUBE_TOKEN;
const accountOf = async (r, brand) => (await brands.getBrand(r, brand.id)).accounts.youtube;

test('authUrl puts the brand in state', () => {
  const url = new URL(authUrl({ YOUTUBE_CLIENT_SECRET: CLIENT }, REDIRECT, 'b_one'));
  assert.equal(url.searchParams.get('state'), 'b_one');
});

test('connecting YouTube for a brand saves the token to that brand and records the channel', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const b = await seedBrand(r, { name: 'B' });
  const got = await handleCallback(r, 'a1', REDIRECT, a.id, { makeClient, channelOf: channels({ 'rt-a1': UC1 }) });
  assert.deepEqual(got, UC1);
  assert.deepEqual(await tokenOf(r, a), { refresh_token: 'rt-a1' });
  assert.deepEqual(await accountOf(r, a), UC1);
  assert.equal(await tokenOf(r, b), null, 'another brand is untouched');
  assert.equal((await settings.loadSettings(r)).YOUTUBE_TOKEN, null, 'nothing goes to the shared settings');
});

test('connecting a channel that another brand already has is refused and saves nothing', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const b = await seedBrand(r, { name: 'B' });
  const channelOf = channels({ 'rt-a1': UC1, 'rt-b1': UC1 });
  await handleCallback(r, 'a1', REDIRECT, a.id, { makeClient, channelOf });
  await assert.rejects(handleCallback(r, 'b1', REDIRECT, b.id, { makeClient, channelOf }), (e) => e.conflict === true && /Already connected to brand "A"/.test(e.message));
  assert.equal(await tokenOf(r, b), null);
  assert.equal(await accountOf(r, b), undefined);
  assert.deepEqual(await tokenOf(r, a), { refresh_token: 'rt-a1' });
});

test('reconnecting a brand to a different channel replaces its channel and token', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const channelOf = channels({ 'rt-a1': UC1, 'rt-a2': UC2 });
  await handleCallback(r, 'a1', REDIRECT, a.id, { makeClient, channelOf });
  await handleCallback(r, 'a2', REDIRECT, a.id, { makeClient, channelOf });
  assert.deepEqual(await accountOf(r, a), UC2);
  assert.deepEqual(await tokenOf(r, a), { refresh_token: 'rt-a2' });
  // The old channel is free again for another brand.
  const b = await seedBrand(r, { name: 'B' });
  await handleCallback(r, 'b1', REDIRECT, b.id, { makeClient, channelOf: channels({ 'rt-b1': UC1 }) });
  assert.deepEqual(await accountOf(r, b), UC1);
});

test('a channel held by another brand\'s unrecorded sign-in is refused', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A', settings: { YOUTUBE_TOKEN: { refresh_token: 'rt-old' } } });
  await brands.setAccount(r, a.id, 'youtube', { id: null, name: null }); // a token from before the move: channel not recorded yet
  const b = await seedBrand(r, { name: 'B' });
  const channelOf = channels({ 'rt-old': UC1, 'rt-b1': UC1 });
  await assert.rejects(handleCallback(r, 'b1', REDIRECT, b.id, { makeClient, channelOf }), (e) => e.conflict === true && /Already connected to brand "A"/.test(e.message));
  assert.deepEqual(await accountOf(r, a), UC1, "A's channel is now recorded");
  assert.equal(await tokenOf(r, b), null);
  assert.equal(await accountOf(r, b), undefined);
});

test('a brand with no account record at all but a token is looked up too, and an unrelated channel goes through', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A', settings: { YOUTUBE_TOKEN: { refresh_token: 'rt-old' } } });
  const b = await seedBrand(r, { name: 'B' });
  await handleCallback(r, 'b1', REDIRECT, b.id, { makeClient, channelOf: channels({ 'rt-old': UC1, 'rt-b1': UC2 }) });
  assert.deepEqual(await accountOf(r, a), UC1);
  assert.deepEqual(await accountOf(r, b), UC2);
});

test("when another brand's channel can't be confirmed the new sign-in is refused and nothing is saved", async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A', settings: { YOUTUBE_TOKEN: { refresh_token: 'rt-old' } } });
  await brands.setAccount(r, a.id, 'youtube', { id: null, name: null });
  const b = await seedBrand(r, { name: 'B' });
  const channelOf = channels({ 'rt-b1': UC2 }); // A's token can't be read
  await assert.rejects(
    handleCallback(r, 'b1', REDIRECT, b.id, { makeClient, channelOf }),
    /Could not confirm the channel of brand "A"; press Test YouTube on it first/
  );
  assert.equal(await tokenOf(r, b), null);
  assert.equal(await accountOf(r, b), undefined);
  assert.deepEqual(await accountOf(r, a), { id: null, name: null }, 'A is unchanged');
});

test("a brand's own unrecorded sign-in does not block replacing it", async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A', settings: { YOUTUBE_TOKEN: { refresh_token: 'rt-old' } } });
  await brands.setAccount(r, a.id, 'youtube', { id: null, name: null });
  await handleCallback(r, 'a1', REDIRECT, a.id, { makeClient, channelOf: channels({ 'rt-a1': UC1 }) }); // rt-old can't be read: not looked up
  assert.deepEqual(await accountOf(r, a), UC1);
  assert.deepEqual(await tokenOf(r, a), { refresh_token: 'rt-a1' });
});

test('a Google account with no channel, or an unknown brand, is refused and saves nothing', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  await assert.rejects(handleCallback(r, 'a1', REDIRECT, a.id, { makeClient, channelOf: channels({ 'rt-a1': null }) }), /No YouTube channel/);
  assert.equal(await tokenOf(r, a), null);
  await assert.rejects(handleCallback(r, 'a1', REDIRECT, 'b_gone', { makeClient, channelOf: channels({ 'rt-a1': UC1 }) }), /not found/);
});
