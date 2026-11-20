# Atlas of the Real

A living new-tab wallpaper: every new tab flies from the Milky Way, through today's real solar system, down to a realistic Earth and your beacon in Milan.

- **The real Earth**, with the real sun: the night side and the day/night line follow the actual time.
- **Your beacon in Milan**: a waypoint with a pulsing scan, Milan's local time, and the sun's height there.
- **A log of achieved goals.** They form a constellation around Earth, linked in the order you achieved them, with the first one tied by a thread to Milan. Each star is coloured by category (Body, Mind, Craft, Wealth, Bonds, Voyage).
- **Real sky.** Planets sit at their real positions for today, the Sun lights Earth from the right side, and the Moon, clusters, nebulae and distant galaxies fill the background.
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
- `Z` replays the flight in from the galaxy; click or press any key to skip it
- Drag the planet to look around. It drifts back to Milan on its own.
- Click an orbiting glyph to open it in the log.

## Your data
Achievements are saved in your browser's local storage. Use **Export** now and then to keep a JSON backup, and **Import** to restore it or move it to another browser.

## Credits
Map data: Natural Earth (public domain), via `world-atlas`. Rendering: `d3-geo` and `topojson-client` (ISC), included in `vendor/`.
