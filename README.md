# LiveDeck

A presentation tool where slides can carry interactive features — polls, sliders, rankings, word clouds, a spinner — alongside ordinary text, image, and video slides. The audience joins from their phones with a code or QR code; their answers appear on the presenter's screen live.

It's a static site (plain HTML, CSS, and JavaScript; no build step) hosted on GitHub Pages, with Firebase for sign-in and live data.

## What's in here

| File | What it does |
|---|---|
| `index.html` | The single page that loads everything |
| `js/types.js` | **Slide types.** Each type (poll, slider, video…) is one entry. Add a new interaction here. |
| `js/editor.js` | Authoring tool: slide list, live preview, properties panel, autosave |
| `js/present.js` | Main display (what you project): join code + QR, slide control, live results, notes, CSV export |
| `js/join.js` | Audience phone view |
| `js/remote.js` | Presenter remote for your phone or iPad: timer, next slide, notes, controls, drawing |
| `js/screen.js` | Opens the main display for a session that's already running |
| `js/live.js` | Pieces shared by the display and the remote |
| `js/dashboard.js` | Your list of presentations (plus the sample deck) |
| `js/themes.js` | **Theme presets** and fonts. Add a preset by adding one line to `PRESETS`. |
| `js/themepanel.js` | The Theme window in the authoring tool |
| `js/widgets.js` | **Custom widget runtime** (the `LiveDeck` API) and the starter examples |
| `js/widgetlib.js` | The Widgets window: write, test, and save your own widgets |
| `js/ink.js` | Drawing on slides while presenting |
| `js/store.js` | Data layer (Firebase, or this browser in local mode) |
| `js/config.js` | **Paste your Firebase config here** |
| `css/app.css` | All styles |
| `firestore.rules`, `storage.rules` | Security rules to paste into Firebase |
| `media/` | Optional: put images or .mp4 files here and reference them as `media/name.jpg` |

## Step 1 — Put it on GitHub Pages

1. Create a new repository on GitHub and upload all of these files (keep the folder structure).
2. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch**, choose `main` and `/ (root)`, and save.
3. After a minute your site is at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

It works right away in **local mode**: decks save in that browser only. Click **Add sample deck** to see every slide type. To try the audience side, click Present, then open the join link (`…/#join-CODE`) in another tab of the same browser.

## Step 2 — Connect Firebase

1. Go to the Firebase console and create a project (Google Analytics is optional).
2. **Add a web app** (the `</>` icon). Copy the `firebaseConfig` values into `js/config.js`.
3. **Authentication → Sign-in method:** turn on **Google** (for you) and **Anonymous** (for audience phones).
4. **Authentication → Settings → Authorized domains:** add `YOUR-USERNAME.github.io`.
5. **Firestore Database → Create database** (production mode is fine).
6. **Firestore → Rules:** paste in `firestore.rules` (if you set up an earlier version, paste the new one: it adds your theme and widget libraries), replace `YOUR_EMAIL@tcu.edu` with your Google account email (add more emails to the list for co-presenters), and **Publish**.
7. Commit the updated `js/config.js`. Reload the site and sign in with Google.

The config values in `config.js` are not secret — every Firebase web app ships them to the browser. The rules are what protect your data: only the emails you list can create or edit decks and run sessions; audience phones can only write their own answers, only while a session is open.

### Optional: image uploads

Without Storage you can still use images by pasting a link, or by committing image files to the `media/` folder and typing `media/photo.jpg` in the Image field.

To enable the **Upload** button: in Firebase, turn on **Storage**, paste `storage.rules` (same email edit), and make sure `storageBucket` is filled in `config.js`. Firebase may ask you to move the project to the pay-as-you-go (Blaze) plan to turn on Storage; small classroom use typically stays within the free allowance, but check Firebase's current pricing before upgrading.

## Using it

**Authoring:** Open a presentation. Left: slides (drag to reorder). Center: live preview, with sample results so you can see what interactive slides will look like. Right: the selected slide's content, plus speaker notes. **+ Add slide** offers every type. Everything autosaves. **Export JSON** gives you a backup file you can re-import from the dashboard.

**Pictures anywhere:** Every slide has a **Pictures on this slide** section in the right-hand panel. Add as many pictures as you like (paste links, or upload several at once), then drag them on the slide to move them. Drag a corner to resize (the picture keeps its shape; hold Shift to stretch it), or drag an edge to stretch one side. Edges and centres snap to the slide's edges and centre line (hold Alt/Option while dragging to turn snapping off). Arrow keys nudge the selected picture (Shift for bigger steps) and Delete removes it. Each picture can show whole or be cropped to fill its box, sit in front of or behind the slide's text, and be brought forward or sent backward. For a collage, use the **Free layout** slide type, which starts empty. On audience phones, a slide's pictures appear stacked below its text.

**Presenting:** Click **Present**. A join screen shows a QR code and a 5-character code; press → (or Start) to begin. Keys: ← → move · **R** reveal/hide results · **S** spin · **J** join screen · **N** speaker notes · **F** full screen. Results stay hidden until you reveal them, so early answers don't sway the room. Reloading the presenter tab keeps the same session and code.

**Presenter remote (phone or iPad):** On the main screen, click **Presenter remote** and scan the code with your phone or iPad (sign in there with the same Google account). The remote shows a timer (it starts on your first Next; set a talk length to see time left, which turns amber in the last five minutes and red when you're over), the current slide with live results, a preview of the next slide, your notes, and big **Back** / **Next** buttons. You can also swipe the slide to move, reveal results, spin, show the join screen, jump to any slide, or end the session. Tap **Draw** to annotate with your finger or Apple Pencil: the ink appears on the projected screen. The remote keeps the screen awake while it's open. With two screens on one computer, use **Open presenter view in a new window** instead and drag the main window to the projector. If you started the session somewhere else, open `…/#screen-CODE` on the projector computer to show the display for it.

**Drawing:** While presenting, press **D** (or the pencil button at the bottom-left of the slide) to draw. The toolbar has a pen, highlighter, laser pointer, eraser, six colours, three sizes, undo, and clear. Shortcuts while drawing: **P** pen · **H** highlighter · **L** laser · **E** eraser · **Ctrl/Cmd+Z** undo · **Esc** stop drawing. Arrow keys still change slides. Ink is kept per slide, so it's still there when you come back, and survives a reload of the presenter tab. With an Apple Pencil on an iPad, lines get thicker as you press harder, and once you've used the Pencil, finger touches are ignored so your palm can rest on the screen. (Ink shows on the presenter screen, which is what you project. It isn't sent to phones.)

**Results:** Every response is saved in Firestore under `sessions/CODE/responses`. **Results CSV** downloads one row per participant per answer (participants are anonymous: P1, P2…), ready for analysis.

## Themes

In the authoring tool, click **Theme**. Pick one of the presets (Classic, Chalkboard, Midnight, Paper, Royal, Garden, High contrast) or change any of them: background, text, accent (chart bars), and highlight colours; heading and body fonts (built-in or Google Fonts); and an optional background image, with a slider that fades it so text stays readable. Changes apply to the whole deck as you make them. **Save to My themes** keeps a theme in your library so you can use it in any deck. Audience phones pick up the deck's accent colour and heading font.

To add a preset everyone gets, add one line to `PRESETS` in `js/themes.js`.

## Custom widgets

Click **Widgets** in the authoring tool to open your widget library. Start from an example (Blank starter, Estimation, Applause meter, Shared timer) or paste in your own code, then test it right there: a big-screen preview plus up to three test phones, with answers from the test phones showing up on the big screen. **Save** puts it in your library. To use it, add a **Custom widget** slide, choose the widget, and (optionally) fill in that slide's **Settings**, for example `{ "answer": 1971 }`, so one widget can be reused with different content.

A widget is a small web page: HTML, a `<style>` block, and a `<script>`. It runs in a sandbox on the big screen and on every phone, and talks to LiveDeck through `window.LiveDeck`:

| | |
|---|---|
| `LiveDeck.mode` | `'stage'` (big screen while presenting), `'phone'`, or `'edit'` (preview in the editor) |
| `LiveDeck.prompt` | The slide's title |
| `LiveDeck.config` | The slide's Settings box (parsed as JSON if it is JSON, otherwise text) |
| `LiveDeck.theme` | The deck theme. CSS variables `--bg`, `--ink`, `--accent`, `--highlight`, `--hf` (heading font), `--bf` (body font) are also set. |
| `LiveDeck.onUpdate(fn)` | Calls `fn(state)` now and whenever something changes. On the big screen, `state` is `{ values, count, reveal, live }`: `values` holds every phone's latest answer, and `reveal` is true once you press R. On a phone, `state` is `{ value, live }`. |
| `LiveDeck.submit(v)` | (Phone) Sends this phone's answer: any JSON value up to about 2 KB. A new submit replaces the old one. |
| `LiveDeck.setLive(v)` | (Big screen, while presenting) Sends a value to every phone, which receives it as `state.live`. Use it for timers, revealed answers, rounds of a game. |

The sandbox can't see your Firebase sign-in or anything else on the page, and phones can only send answers in the same way as built-in slides. Answers to custom widgets are saved and exported in the Results CSV like any other.

A good way to make a new widget is to describe it to Claude, mention this table, and paste the code it gives you into a new widget. When you export a deck as JSON, the custom widgets it uses are bundled into the file, and importing that file adds them to your library.

## Adding a new built-in kind of slide

Custom widgets (above) are the quick way. To make a new slide type part of the app itself, open `js/types.js` and add an entry to `TYPES`. The comment at the top lists what each entry can define. An interactive type needs: `defaults`, `fields` (what the editor shows), `mount` (the phone control), `valid` (accept or reject an answer), `viz` (how results look on screen), and `sim` (a fake answer for previews). The editor, presenter, phones, and CSV pick it up automatically.

## Updating the site

Browsers keep copies of the site's files for a few minutes, so after you upload new files you might still see the old version. The version number shows at the bottom of the presentations page and in the editor's top bar.

When you change the code yourself, change the version so browsers fetch the new files: replace every `?v=2.3` with a new number such as `?v=2.4` (search and replace across `index.html` and the `js` folder), and update `js/version.js` to match.

## Updating Firebase

`js/store.js` loads the Firebase SDK from Google's CDN at the version in `FIREBASE_VERSION`. It's pinned so the app doesn't change underneath you; bump it when you want a newer release.
