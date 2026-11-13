const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const cfg = require('./config');
const { parseJson } = require('./util');

const SYSTEM =
  'You are a professional YouTube content writer and strategist. You return the requested data only, ' +
  'with no commentary, following every rule in the request exactly.';

/**
 * Ask the model for JSON matching `schema`.
 *   LLM_PROVIDER=claude-code (default): runs the local `claude` CLI headless, billed to your Claude plan.
 *   LLM_PROVIDER=api: Anthropic API with ANTHROPIC_API_KEY.
 */
/**
 * Ask the model for JSON matching `schema`.
 * tools: built-in Claude Code tools to allow (default none); cwd: the folder the CLI runs in (default an empty
 * temp folder, so it never reads this project); images: files the API path attaches (the CLI reads them with Read).
 */
async function askJson({ prompt, schema, name, description, maxTokens = 8000, tools = [], cwd = null, images = [], timeoutSec = null }) {
  return cfg.llmProvider === 'api'
    ? viaApi({ prompt, schema, name, description, maxTokens, images })
    : viaClaudeCode({ prompt, schema, tools, cwd, timeoutSec });
}

/* ---------- Claude Code headless (your Claude plan, no API key) ---------- */

/**
 * Environment for the CLI. Drops API credentials so it uses your Claude plan instead of silently
 * billing the API key that dotenv loaded from .env. Inside Docker there is no interactive login,
 * so the long-lived token from `claude setup-token` is passed in.
 */
function claudeEnv(base = process.env) {
  const env = { ...base };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']) delete env[k];
  if (cfg.claudeOauthToken) env.CLAUDE_CODE_OAUTH_TOKEN = cfg.claudeOauthToken;
  return env;
}

function viaClaudeCode({ prompt, schema, tools = [], cwd: dir = null, timeoutSec = null }) {
  const limitSec = Math.max(cfg.claudeTimeoutSec, timeoutSec || 0); // a long script gets longer than the default
  // Run in an empty folder so it never reads this project's files or a CLAUDE.md (or in the folder given,
  // e.g. a review folder holding one contact sheet).
  const cwd = dir || path.join(os.tmpdir(), 'yt-automation-claude');
  fs.mkdirSync(cwd, { recursive: true });

  const env = claudeEnv();

  const args = [
    '-p',
    '--output-format', 'json',
    '--model', cfg.model,
    '--json-schema', JSON.stringify(schema), // CLI validates the answer against the schema
    '--system-prompt', SYSTEM,
    '--tools', tools.join(','), // default none: it only writes text (the critic gets Read for its sheet)
    '--strict-mcp-config', // no MCP servers
    '--setting-sources', '', // no user/project settings, hooks or plugins
    '--disable-slash-commands',
    '--no-session-persistence',
  ];

  return new Promise((resolve, reject) => {
    const p = spawn(cfg.claudeBin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error(`claude CLI timed out after ${limitSec}s`));
    }, limitSec * 1000);

    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Could not start "${cfg.claudeBin}": ${e.message}. Install Claude Code and log in by running "claude" once, ` +
            'or set CLAUDE_BIN in .env to the full path of claude.exe.'
        )
      );
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      let res;
      try {
        res = JSON.parse(out);
      } catch {
        return reject(new Error(`claude CLI exited with ${code}: ${(err || out).slice(-800)}`));
      }
      if (res.is_error || res.subtype !== 'success') {
        const why = res.result || res.subtype || err.slice(-400);
        return reject(
          new Error(`claude CLI error: ${why}. If it says you are not logged in, run "claude" once and log in.`)
        );
      }
      try {
        resolve(res.structured_output || parseJson(res.result || ''));
      } catch (e) {
        reject(new Error(`claude CLI returned no usable JSON: ${e.message}`));
      }
    });

    p.stdin.end(prompt, 'utf8');
  });
}

/* ---------- Anthropic API ---------- */

async function viaApi({ prompt, schema, name, description, maxTokens, images = [] }) {
  if (!cfg.anthropicKey) throw new Error('LLM_PROVIDER=api but ANTHROPIC_API_KEY is not set');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: cfg.anthropicKey });

  // A tool call returns already-parsed JSON matching the schema. This model rejects forced
  // tool_choice, so we ask for the call in the prompt and fall back to parsing text.
  const msg = await client.messages.create({
    model: cfg.model,
    max_tokens: maxTokens,
    system: SYSTEM,
    tools: [{ name, description, input_schema: schema }],
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((f) => ({ type: 'image', source: { type: 'base64', media_type: f.endsWith('.png') ? 'image/png' : 'image/jpeg', data: fs.readFileSync(f).toString('base64') } })),
          { type: 'text', text: `${prompt}\n\nDeliver the result by calling the ${name} tool. Do not reply with plain text.` },
        ],
      },
    ],
  });
  if (msg.stop_reason === 'max_tokens') throw new Error(`${name}: reply was cut off (max_tokens)`);
  const block = msg.content.find((b) => b.type === 'tool_use');
  return block ? block.input : parseJson(msg.content.map((b) => b.text || '').join(''));
}

/* ---------- Claude Code headless with tools: the design pass ---------- */

/**
 * Run Claude Code as an agent confined to cwd: Read/Glob/Grep/Write work only inside that folder (path-pattern
 * permission rules are not honoured by this CLI build, so the folder itself is the sandbox: put copies of what it
 * may read in there). No MCP servers, no Bash, no network tools. Resolves { text, costUsd, turns, seconds }.
 */
function runAgent({ prompt, cwd, timeoutSec = 600, maxTurns = 100, tools = ['Read', 'Glob', 'Grep', 'Write'] }) {
  if (cfg.llmProvider === 'api') return Promise.reject(new Error('DESIGN_MODE=instant needs LLM_PROVIDER=claude-code (the design pass runs Claude Code with tools)'));
  const env = claudeEnv();
  const args = [
    '-p',
    '--output-format', 'json',
    '--model', cfg.model,
    '--tools', tools.join(','),
    '--allowedTools', ...tools, // inside cwd only; anything else is denied without asking
    '--permission-mode', 'default',
    '--max-turns', String(maxTurns),
    '--strict-mcp-config',
    '--setting-sources', '', // the design folder has no settings; the skills are read as files
    '--disable-slash-commands',
    '--no-session-persistence',
  ];
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const p = spawn(cfg.claudeBin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error(`design pass timed out after ${timeoutSec}s`));
    }, timeoutSec * 1000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Could not start "${cfg.claudeBin}": ${e.message}`));
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      let res;
      try {
        res = JSON.parse(out);
      } catch {
        return reject(new Error(`claude CLI exited with ${code}: ${(err || out).slice(-800)}`));
      }
      if (res.is_error) return reject(new Error(`claude CLI error: ${res.result || res.subtype || err.slice(-400)}`));
      // error_max_turns still leaves the files it wrote: the caller checks what is there
      resolve({ text: String(res.result || ''), subtype: res.subtype, costUsd: res.total_cost_usd || null, turns: res.num_turns || null, seconds: Math.round((Date.now() - t0) / 1000) });
    });
    p.stdin.end(prompt, 'utf8');
  });
}

module.exports = { askJson, claudeEnv, runAgent };
