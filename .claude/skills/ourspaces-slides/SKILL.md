---
name: ourspaces-slides
description: Make HTML slide decks, or add slides, in the OurSpaces house style (cream cards with a hard ink shadow on a tan mat, Bricolage + IBM Plex, one accent colour per slide, lime highlight). Use when asked for a deck, slides, a presentation or a pitch in this repo, or to add or restyle a slide in docs/ourspaces-product.html or docs/firecrawl-and-agentmail.html. Output is one self-contained .html file, not .pptx.
---

# OurSpaces slides

A deck is one HTML file with no build step and no framework. The only
network request is Google Fonts. Two decks set the style:

- `docs/ourspaces-product.html`: the product pitch in plain words, 15 slides
- `docs/firecrawl-and-agentmail.html`: a technical walkthrough with file
  chips and scoreboards, 19 slides

`template.html` in this folder is the kit. It holds the shared style block
(byte-identical to both decks), the optional components, the nav script,
and one example slide per layout. Open it in a browser to see every layout.

## New deck

1. `cp .claude/skills/ourspaces-slides/template.html docs/<name>.html`.
   `docs/` is tracked and **the repo is public**. A deck strangers
   shouldn't read goes in gitignored `docs/local/` instead.
2. Set `<title>`. Keep slide 1 (title) and the last slide (closer). Replace
   the example slides in between with your own, built from the layouts below.
3. In the second `<style>` block, delete the components no slide uses.
4. Number the slides. Each `.foot` ends with a two-digit number (`02`), and
   the `<!-- N · layout -->` comment above each slide matches it.
5. Add a row to `docs/doc-map.md` (tracked decks only).
6. Run the check under **Verify**.

## New slide in an existing deck

Copy the nearest slide with the same layout, from the same deck if it has
one, otherwise from `template.html`, and edit it. If it needs a component
the deck doesn't have yet (`.rooms`, `.toys`, `.beats`, `.quote`, `.vs`),
copy that CSS from the template's second `<style>` block into the deck's.
Then renumber every foot after the insert point.

## The look

- **Never edit the first `<style>` block.** It is the style, and it stays
  identical across every deck. CSS for one deck goes in a second
  `<style>` block after it. If the shared block really has to change,
  change it in every deck and in `template.html` together.
- **Tokens only, no new hex.** The tokens mirror `src/index.css` `@theme`.

  | Token | Meaning on a slide |
  |---|---|
  | `--lime` | title, closer, wrap-up and "how it connects" slides; also `.hl` |
  | `--fire` | Firecrawl, the web, links (`--color-trip`) |
  | `--mail` | AgentMail, email in and out (`--color-crew`) |
  | `--teal` | liveness, proof, getting in (`--color-league`) |
  | `--pink` | where the idea comes from, who it's for (`--color-couple`) |
  | no accent | neutral slides: the problem, scope. Accent falls back to ink |

  The only raw colours are the `.yes` / `.no` / `.warn` green, red and
  amber. Before/after cards reuse them as `--accent`.
- **One accent per slide**, set on the section:
  `<section class="slide" style="--accent: var(--fire)">`. It colours the
  eyebrow dot, bullet diamonds, `.num` chip, `.see` bar, stat number and
  foot tag. All slides in a section share an accent.
- **One `.hl` lime highlight per slide at most**, on the line to remember.
- **Foot tag:** a section's slides put `<span class="tag">Name</span>` in
  the foot. Add `on-dark` when the accent is `--mail` or `--pink`, so the
  text turns cream. Everywhere else the foot's left side is plain text.

## Anatomy

```html
<!-- 4 · statement ──────────────────────────────────── -->
<section class="slide" style="--accent: var(--mail)">
  <div class="body">
    <p class="eyebrow" data-step><span class="dot"></span> Where you are</p>
    <h2 data-step>A full sentence,<br />split over two lines.</h2>
    <p class="lede" data-step>The same idea, said again with more words.</p>
    <ul class="points" style="margin-top: 22px">
      <li data-step><strong>Bold lead.</strong> Then the rest of it.</li>
    </ul>
  </div>
  <div class="foot"><span>Label</span><span>04</span></div>
</section>
```

- `.body` centres the content vertically. `.foot` sits at the bottom.
- `h1` only on the title and closer slides. Every other slide uses `h2`.
- `.sub` is the short muted line under a headline. `.lede` is the bigger
  ink paragraph.
- Spacing tweaks go inline (`style="margin-top: 22px"`), the way the decks
  already do it.

## Layouts (every one is in `template.html`)

| Layout | Pieces | Use it for |
|---|---|---|
| title / closer | `h1` with `.hl`, `.sub`, `.file` on the closer | first and last slide |
| statement | `h2`, `.lede`, `ul.points` | one idea plus 3–4 supports |
| compare | `.vs` > `.stat` · `span.mid` · `.stat` | before/after, the chat vs a space |
| numbered section | `h2 .num`, `.sub`, `.cols.tight` > (`.see` + `.file`) / `ul.points` | one feature per slide in a series |
| big numbers | `.cols` > `.stat` with `.n` + `small` | two counts side by side |
| scoreboard | `table`, `td.mark` `.yes`/`.warn`/`.no`, `tr.is-star` | closing a section: done vs not |
| flow | `.flow .row`, `.pill` (`.mail` `.fire` `.lime`), `.arrow` | a chain of steps; label several chains with bare eyebrows |
| timeline + quote | `.beats .beat` (`.is-peak`), `.t`, `.w`; `.quote .attrib` | demo beats with timings, the line someone said |
| cards | `.rooms .room` with `--room` / `--room-ink` | three spaces or three options |
| pills | `.toys span`, `span.more` | a long list of names |

## Copy

- Headlines are full sentences with a full stop, split into two short lines
  with `<br />`: "Every space has<br />its own email address."
- The eyebrow says where you are (`Firecrawl · 2 of 5`) or frames the slide
  (`The thing we're up against`).
- Three or four bullets at most. Each opens with a `<strong>` phrase, and
  the bold phrases alone should carry the slide.
- Product decks: no jargon, no file chips. Say what a person sees happen.
  Technical decks: file chips (`convex/file.ts · functionName`) and inline
  `<code>` are fine.
- Plain and direct, like the app copy. No taglines.

## Motion

- Put `data-step` on each top-level element that should stagger in. Leave
  `--i` off; the script numbers them in page order. Set `--i` by hand on
  all of a slide's steps or on none of them, because the auto-numbering
  skips hand-set ones and a mix gives two elements the same delay.
- Put `data-step` on a wrapper or on its children, not both.
- Don't add animations. The deck uses the house tokens (`--ease-glide`,
  `--ease-pop`, `--dur-*`), and reduced motion is already handled.

## Controls (already wired)

→ / Space / PageDown go forward. ← / PageUp go back. Home and End jump to
the ends. Clicking the right or left half of the screen also moves.
`#5` in the URL opens slide 5. **P** prints one slide per page, so "Save as
PDF" exports the deck.

## Verify

The card is a fixed 1180×680 box with `overflow: hidden`, so text that
doesn't fit gets **cut off without any warning**. Screenshot every slide
and look at them:

```bash
.claude/skills/ourspaces-slides/shots.sh docs/<name>.html
```

It prints a contact-sheet path. Read the sheet and check each slide:
nothing clipped at the bottom or right edge, nothing crowding the foot,
headlines on two lines. If a slide is full, split it in two.

Open a deck locally with `open docs/<name>.html`. No server needed.
