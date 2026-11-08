# Chapter 14: Package it as a kit

Bundles the skill, rules, presets and prompts into a folder you can hand to anyone, then proves it works by installing it on a clean machine and rendering a test.

## Prompt

```text
Package everything we built across these chapter folders into a free lead-magnet kit called "Motion Reel Kit", as ./motion-reel-kit/ plus a zip of it.

Look through the chapter folders and pull the latest working version of each file. Don't rewrite them from scratch.

Include:
- CLAUDE.md with the motion rules (seek(t), no Math.random, no timers or CSS transitions in render mode, springs only, the banned-cliché list).
- .claude/skills/motion-reel/ with SKILL.md and every file it needs: the engine index.html, lib/motion.js, beats.py, sfx.mjs, render.mjs, and the critique prompt.
- presets/lukas-yt as a worked example, plus presets/blank with every field commented so people can fill in their own brand.
- prompts/ with one Markdown file per chapter prompt, in order, plus the director's brief as a fill-in-the-blanks template and the critique scorecard.
- README.md: what it is, a 3-step quick start (install Node, ffmpeg and Playwright, drop in the folder, type /motion-reel), and one example command. At the top add: "Get weekly updates on the latest AI workflows to 10x your productivity: https://www.weekly10x.com"

Rules:
- Strip anything private: API keys, .env files, personal file paths, client assets, node_modules, and large renders. Keep one small example MP4 under 10 MB if we have one.
- Check that it works on a clean machine: copy the kit to a temp folder, install, and render a 5-second test with the blank preset. Fix whatever breaks.
- When you're done, show me the folder tree, the zip size, and anything you had to rebuild or couldn't find.
```

## Make it yours
Swap in your own preset name and the line you want at the top of the README. This kit is the output of this prompt.
