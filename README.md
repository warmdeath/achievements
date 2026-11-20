# Atlas of the Real

A living new-tab wallpaper in a No Man's Sky style palette.

- **The real Earth**, with the real sun: the night side and the day/night line follow the actual time.
- **Your beacon in Milan**: a waypoint with a pulsing scan, Milan's local time, and the sun's height there.
- **A log of achieved goals.** Each one becomes a glyph orbiting the planet, coloured by category (Body, Mind, Craft, Wealth, Bonds, Voyage).
- **No dreams allowed.** The dream filter turns away any entry dated in the future or written as a wish ("I will…", "someday…", "want to…", "dream…").

## Use it as your new tab

### Chrome, Edge, Brave, Arc (recommended)
1. Download or clone this folder.
2. Open `chrome://extensions` and switch on **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Open a new tab.

### Firefox
Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `manifest.json`. Temporary add-ons are removed when Firefox restarts. To keep it, set `index.html` as your home page instead.

### Just look at it
Open `index.html` in any browser.

## Keys
- `N` logs a new discovery
- Drag the planet to look around. It drifts back to Milan on its own.
- Click an orbiting glyph to open it in the log.

## Your data
Achievements are saved in your browser's local storage. Use **Export** now and then to keep a JSON backup, and **Import** to restore it or move it to another browser.

## Credits
Map data: Natural Earth (public domain), via `world-atlas`. Rendering: `d3-geo` and `topojson-client` (ISC), included in `vendor/`.
