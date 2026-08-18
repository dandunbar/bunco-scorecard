# Bunco Scorecard

An iPhone home-screen app for keeping your own Bunco card: the running score you
share with your partner, and — separately — the number of Buncos that are
actually **yours**.

Four sets of six rounds, ones through sixes, four times through. Twenty-four
rounds in all.

## Scoring

Three dice, rolling for the round's number:

| What you rolled | Points |
| --- | --- |
| One die showing the number | **1** |
| Two dice showing the number | **2** |
| Three of any *other* number | **5** |
| Three of the number — a **Bunco** | **21** |

## Why there are two 21 buttons

You play with a partner and you share one score, so a Bunco your partner rolls
still puts 21 points on the card. But it is not *your* Bunco, and the prize goes
to whoever personally rolled the most.

So the app asks who had the dice:

- **BUNCO +21 — you rolled it** — adds 21 to the score **and** to your Bunco
  count.
- **+21 — partner rolled it** — adds 21 to the score only.

Everything else (1, 2, 5) is just points, so it doesn't matter who rolled it.
The header keeps `Your Buncos` in the brighter tile, with your partner's 21s in
small text beneath it as a cross-check.

## Using it at the table

1. The big die shows the number you're rolling for this round.
2. Every time a roll scores, tap the matching button. Rolls that score nothing
   are not entered — there's nothing to record.
3. When the round ends, tap **›** to move to the next number.

An **Undo** appears after every tap, and **Undo last** in the round panel walks
back through the current round one roll at a time.

The **‹** and **›** arrows move between rounds, and any row on the **Card** tab
jumps straight to that round — useful when you notice a round back was
mis-tapped. Nothing is locked, so a round can be corrected at any point in the
night.

## The Card tab

The full 24-round grid, three columns wide:

- **Round & rolls** — the number being rolled for, then every roll that scored,
  in the order it happened. Amber is three of another number, rose is your
  Bunco, blue is your partner's 21.
- **Bunco** — how many Buncos *you* rolled that round, subtotalled per set.
- **Total** — the round's points.

A round that has been played always shows a number in the Total column, `0`
included, at full strength. A round still to come shows a dimmed `—` instead.
That way a round where nothing scored reads as finished rather than as
unplayed — the two are otherwise both worth zero and look identical.

Moving on with **›** is what marks a round finished, so normally there is
nothing to do. For a round that scored nothing there is also a **Round over, no
score** button in the round panel, which toggles — handy for the last round of
the night, where there is no **›** left to press.

## Settings

- **Game name** and **date** — shown in the header and on the shared summary.
- **Share this game's summary** — a plain-text card (totals, Bunco counts, and
  the per-set breakdown) through the iOS share sheet, or the clipboard if the
  share sheet isn't available.
- **End game & start fresh** — files the card under *Past games* and resets to
  Set 1, Round 1. Tapping a past game shares its summary.

## Installing on the iPhone

Open the site in **Safari**, tap the share button, then **Add to Home Screen**.
It then launches full-screen with no browser chrome, like the Happy Hour app.

Open it once on wifi so the service worker can store the files. After that it
works with no connection at all — worth doing before the first game, since it
is the only step that needs the internet. Settings shows whether it's ready.

## Where the data lives

In this phone's `localStorage`, and nowhere else. Nothing is uploaded and there
is no account. Clearing Safari's website data for the site erases the current
card and the past-game history, so share a summary before doing that.

Two keys are used: `bunco.state.v1` (the card in progress) and
`bunco.history.v1` (the last 24 finished games).

## Development

No build step, no dependencies — plain HTML, CSS, and JavaScript.

```bash
python -m http.server 8766 --directory .
```

A service worker caches the app **cache-first**, so an edit takes one extra
launch to appear. When shipping a change, bump `CACHE` in `sw.js` *and*
`APP_VERSION` in `app.js` — they are compared, and installed phones will keep
serving the old files otherwise.

Three things there are easy to get wrong and worth leaving alone:

- **`[hidden] { display: none !important; }` near the top of `styles.css`.**
  Views, dialogs and the toast are all shown and hidden by setting `.hidden`
  from JS. The browser's own `[hidden]` rule is specificity (0,1,0), and so is
  a class rule like `.overlay { display: flex }` — author styles win ties
  against the browser, so without that line `hidden` does nothing at all and
  every dialog sits permanently over the app.

- **Cache names are prefixed `bunco-`, and only that prefix is ever deleted.**
  Every project on `dandunbar.github.io` shares one origin, and CacheStorage is
  per-origin, not per-scope. A worker that sweeps "every cache that isn't mine"
  will delete the Happy Hour app's cache — and vice versa — leaving both
  needing a network connection to rebuild the thing meant to work without one.
- **`sw.js` is registered with `updateViaCache: 'none'` and excluded from the
  worker's own fetch handler.** GitHub Pages puts a `max-age` on it, so without
  this the browser can serve a stale worker from its HTTP cache and the app
  stays frozen on an old version no matter what is on the server.
