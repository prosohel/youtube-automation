# Library mode: an explainer graphics kit that Claude directs scene by scene

Piece 2 of 4 in the "fresh animation every video" work. Piece 1 is built: Claude writes a short intro label (`kicker`) and picks each scene's transition, sound cues and camera move, with a dashboard switch per pick (`src/direction.js`). Piece 3 lets Claude write its own animation code for 1–2 scenes. Piece 4 saves good custom drawings into this library.

## Why

The owner finds the videos repetitive. Today a scene can show only 4 kinds of graphic: icon, stat ring, list, compare. Transitions and sounds come from small fixed sets. The owner wants each video to feel newly made: new graphs, transitions and sound effects every time.

The look they want comes from a reference video: Turag Decodes, "AI আসলে কতদূর এগিয়ে গেছে? বাংলাদেশ কতটা রেডি" (https://youtu.be/pGj3tcUnWSw). What makes it work:

- **Flat illustration everywhere, no stock footage.** Simple, consistent people figures, with one highlighted figure in orange as the protagonist.
- **A small palette:** beige paper (or a dark navy variant), an orange-red accent, electric blue for anything AI (with a halftone dot glow), and greys.
- **A video frame that runs throughout:** a numbered chapter tag top-left ("০২ এআই এখন কী পারে"), camera crosshair marks in the corners, and captions in a black box with a red left bar.
- **A different graphic idea in each scene:**
  - big Bangla numbers ("১৬ জন", "এখন: ১-২ জন + এআই এজেন্ট")
  - icon/people grids (16 economists at desks) and a huge dot field to show scale
  - a world map with highlighted countries, and a network diagram (a person linked to AI-agent nodes)
  - paper notes with questions and a red rubber stamp ("পুরনো প্রশ্ন")
  - UI mockups (a TV app grid, a prompt card), source labels ("THE WALL STREET JOURNAL")
  - visual metaphors (a cracked shield)

The owner chose "Claude as director over a bigger library" as the main mode, because a pre-built library never breaks a render. Truly new drawings (the cracked shield, a tea-stall street) are piece 3.

## Goals

1. **A catalogue of new scene graphics** (below), each one Claude can pick per scene and fill with that scene's own words and numbers.
2. **Every graphic works in every theme and both formats**: Shorts 1080×1920 and landscape 1920×1080. It uses the active theme's colours, fonts and motion feel. In the Vox family it uses the paper-collage treatment (tape, torn edges, marker, stepped motion) through the existing helpers in `src/remotion/Vox.jsx`.
3. **Two new themes in the reference's style**, `explainer-paper` (beige) and `explainer-night` (navy), with the explainer frame: chapter tag, corner crosshairs, and a "bar" caption style (dark box + accent left bar).
   - **They form a third theme family, `explainer`, next to `vox`.** Flat drawing: no glow, no pulsing rings, no light leaks, no particles, smooth (not stepped) motion. The camera may move.
   - **Each new graphic is built once.** It's styled through theme tokens plus a small per-family "surface" helper: default = today's card look, vox = paper/tape/torn edges, explainer = flat shapes with a halftone accent. There are not three separate versions per graphic.
   - **Today's four types (`icon`, `stat`, `list`, `compare`) get flat explainer versions,** because their glowing rings don't fit the look.
   - **`test/themes.test.js` is extended to the explainer family:** readable contrast of text on the background and on the accents, flat flags (no `leaks`, `glitch` or `particles`), and the frame overlays present.
   - **Fixed colour roles in explainer themes:** the accent order is never rotated, Claude's own accent colour is ignored, and every scene uses the same roles. `accents[0]` (orange-red) marks highlights and the protagonist. `accents[1]` (electric blue) marks the secondary or "technology" side. For example: the network's outer nodes, the dots in a dot field, the non-highlighted side of a comparison. No per-item "is AI" flag is needed.
4. **Chapters.** On landscape videos Claude groups scenes into 3–6 numbered chapters, each with a short title. Shorts have no chapters.
   - A theme with the explainer frame shows the current chapter tag.
   - **Every landscape video also gets YouTube chapter timestamps in its description**, worked out from the real scene lengths, so chapters are useful in every theme. They're added only when YouTube's rules are met: the first chapter at 00:00, at least 3 chapters, each at least 10 seconds long. Otherwise they're left out quietly. They're appended the way emoji credits are today.
   - No chapter title cards: they would add frames and break the scene/audio timing.
   - No separate switch: chapters are structure, not a visual pick.
5. **More transitions:** add the extra `@remotion/transitions` presentations that render reliably in the Docker image (see Constraints) to the list Claude may pick from.
6. **More sounds:** add the neutral `@remotion/sfx` sounds (`page-turn`, `shutter-modern`, `shutter-old`), plus a small curated pack of CC0 sounds that suit the graphics: a stamp thud, a soft pop, a paper slide, a typing tick, a soft riser, a low hit.
7. **A new dashboard switch, "Claude picks graphics"** (`DIRECT_GRAPHICS`, on by default) in the Visuals card. On: Claude picks from the whole catalogue. Off: only today's 4 types.
8. **No repeats:** extend piece 1's recent-video memory to graphic types, so Claude leans away from the graphics it used most in the last 3 videos.
   - **Within a video,** the prompt asks Claude not to use the same graphic type on two scenes in a row. This is guidance only. Validation never rewrites a scene for repeating, because swapping a chart for an icon would throw away real data.
   - `icon` is exempt (it's the fallback and the call-to-action graphic), a footage scene in between breaks the chain, and with the graphics switch off the rule isn't mentioned.

## The catalogue

Each entry lists what Claude fills in. All on-screen text is in the video's language, short enough to fit (see Constraints). "Real numbers only" means the scene's narration must itself state the figures. This is the same rule the existing `stat` type follows.

| Type | Shows | Claude provides | Rule |
|---|---|---|---|
| `bigNumber` | One huge figure with a label, optional small line above ("এখন:") | value, label, optional pre | Real numbers only |
| `bars` | Bar chart, 2–6 bars, one optionally highlighted | items [{label, value}], unit, highlight | Real numbers only |
| `line` | Line chart drawing itself, 3–8 points | points [{label, value}], unit | Real numbers only |
| `donut` | Donut/pie, 2–5 slices | slices [{label, share}] (shares ≈ 100) | Real numbers only |
| `timeline` | 3–5 dated events along a line | events [{when, text}] | Dates must come from the narration |
| `peopleGrid` | Rows of person (or icon) pictograms, some highlighted ("১৬ জনের ১০ জন") | total (≤ 100), highlight, icon, label | Real numbers only |
| `dotField` | A large field of dots, a share highlighted, to show scale | total, highlight, label | Real numbers only |
| `worldMap` | Dotted world or region map (no borders) with highlighted countries | countries [names], focus (world / asia / south-asia / europe / americas / africa), label | Countries checked against the map data; disputed land always neutral |
| `network` | A centre node linked to 3–7 nodes | centre, nodes [labels] | |
| `notes` | 2–4 paper notes, optional rubber stamp slammed on top | notes [text], stamp | |
| `uiCard` | A phone/app mockup: chat, search box, notification or AI prompt | kind, title, lines (≤ 4) | No real brand logos; names as plain text only |
| `source` | A quote or claim with its source label | text, source | Only sources the narration names; never invented |
| `steps` | 3–5 steps joined by arrows | steps [text] | |
| `people` | 1–5 simple figures in poses, one optionally highlighted, optional speech bubble | figures [{pose, highlight}], bubble | Poses from a fixed set: stand, walk, phone, laptop, point, think, cheer, worried |

The existing `icon`, `stat`, `list` and `compare` stay. Any graphic that fails validation becomes an `icon` graphic, the way an invalid visual falls back today.

## Non-goals

- Claude writing its own animation code. That is piece 3.
- Scene backdrops such as a Dhaka street or a tea stall, and visual metaphors such as a cracked shield. Piece 3 draws these.
- Lottie animation libraries, animated characters that walk or lip-sync, and character rigs.
- Any change to stock-footage B-roll. `VISUALS` (mixed / motion / footage) keeps working as today; the new graphics fill the non-footage scenes.
- Redesigning the 11 existing themes, beyond making the new graphics look right in them.

## Anti-goals (a failure even if it technically works)

- **Invented facts.** A chart, number, map highlight or source label the narration doesn't support. The prompt must keep the "real numbers only" rules, and validation must drop graphics whose numbers are malformed (for example donut shares that don't add up).
- **Text that overflows, clips or wraps badly.** This is the bug that started this work. Bangla text is wider than Latin, and every text slot must fit in both formats.
- **Meme sounds or anything not cleared for commercial use.** These risk YouTube claims. Only CC0, public-domain, MIT/ISC or Remotion's neutral sounds. Anything that needs attribution gets a credit line in the description, like the animated emoji do today.
- **Copying the reference channel's identity:** its name, logo, exact chapter-tag design or caption box. We take the ideas, not the branding.
- **A render that fails or slows down badly** because of a graphic.

## Constraints

- **Rendering:** Remotion 4.0.540. New Remotion packages are pinned to the same version, and any other new dependency is pinned to an exact version. Everything must render in the Docker image (Debian bookworm, headless Chrome, no GPU) and on Windows for development.
  - Transitions that need WebGL (likely `crosswarp`, `ripple`, `dreamy-zoom`, `film-burn`, `zoom-blur`) are added only if a render in the Docker container proves they work; otherwise they're left out.
- **Map data and style (decided by the owner): a dotted map.**
  - Land is drawn as a regular grid of dots, and **no border lines are drawn anywhere**.
  - A highlighted country's dots take the accent colour. Every other dot is neutral.
  - **Disputed territory always stays neutral grey**, never counted as part of any country, even when a neighbouring country is highlighted. Kashmir, Aksai Chin, Arunachal Pradesh and any other area Natural Earth marks as disputed or breakaway are all covered.
  - Public-domain Natural Earth data provides the land shape, the country lookup and the disputed areas. The dot grid with each dot's country can be pre-computed once into a small JSON file committed to the repo, so the render needs no geometry library. The builder decides the tools used to generate it (for example `world-atlas`/`d3-geo`, ISC).
  - Country names Claude gives are matched against a fixed list of English names and common Bangla names. An unknown name is dropped; with no known country left, the graphic falls back.
  - **Why:** the channel has viewers in Bangladesh and India, and a map that differs from India's official borders is a legal and content risk there. Drawing no borders, and never assigning disputed land, avoids taking any side.
- **Sounds:** curated CC0 files are committed to the repo in a tracked folder with a short credits note. `assets/` is gitignored because it's a download cache. Remotion's own sounds keep downloading on first use, the way they do now.
- **Speed:** a graphic may not make a scene meaningfully slower to render. `dotField` and `peopleGrid` must draw with few DOM elements (SVG pattern or canvas, not thousands of nodes). Heavy graphics skip the camera motion blur.
- **Fitting text:** every text slot has a character limit enforced in validation, plus automatic font shrinking in the component. `@remotion/layout-utils` `fitText` at 4.0.540 is acceptable.
- **Validation lives in Node and is unit-tested**, following `src/direction.js`: one place checks each type's fields, clamps sizes (counts, lengths, item numbers) and returns the cleaned graphic or the fallback. The composition trusts only validated data.
- **Fallback for old videos:** videos created before this change render exactly as before.
- **Theme contract:** the new themes must pass the theme tests (`test/themes.test.js`): fonts, cards, headline styles, plus the explainer-family checks in goal 3.
- **One prompt, kept compact:** the script prompt describes the catalogue briefly, with a one-line example per type. When the graphics switch is off, only today's 4 types are described.

## Decided by the owner

- Library mode is the main, default mode. Custom code (piece 3) is a separate optional mode, and both can be on together.
- Each kind of thing Claude may change has its own on/off switch in the dashboard. This piece adds the graphics switch.
- Both illustrated people and data graphics are wanted.
- The reference video above is the style to aim for.
- The world map is a dotted map with no border lines, and disputed land is never assigned to any country (see Constraints).

## Calls I made (the owner can overrule)

- The two `explainer-*` themes join the normal rotation: Claude picks themes per video and avoids recent ones. The owner can force one with the existing `THEME` setting.
- Chapters only on landscape videos. A Short is under a minute, and chapter tags would crowd the frame.
- The chapter tag and corner marks belong to the explainer themes only. Other themes don't get them.
- `people` figures are simple flat-vector silhouettes (no faces, no clothing detail, no hands-on props beyond phone and laptop), with the highlighted figure in the theme's accent colour.
- The new transitions and sounds also become available to piece 1's picks. They are not tied to the new themes.

## Left to the builder

- The exact visual design and animation of each graphic, within the reference style and each theme's palette and motion.
- Field limits (characters per text slot, item counts) as long as they keep Bangla text fitting.
- File layout of the new components, and whether validation goes in `src/direction.js` or a new `src/graphics.js`.
- Which extra transitions pass the Docker render check, and which specific CC0 sounds go in the pack.
- A build order that ships in usable steps. A sensible one:
  1. plumbing, plus `bigNumber`, `bars`, `donut`, `timeline`
  2. `notes`, `source`, `steps`, `uiCard`, `network`
  3. `peopleGrid`, `dotField`, `worldMap`
  4. `people`
  5. the explainer themes, frame and chapters
  6. transitions and sounds
- **A preview gallery:** a dev script (for example `npm run render:gallery`) that renders a still of every graphic type in a few themes and both formats into one contact sheet, so the owner can review the look without making a whole video.
