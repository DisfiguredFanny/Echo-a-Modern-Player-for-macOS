# Echo — Feature Specification & Documentation

Echo is a lightweight, high-performance macOS menu bar and desktop audio player crafted for your own DRM-free music files: your locally stored library managed by the Music app, downloaded Apple Podcasts episodes, or a folder of audio files. Built natively in Swift and SwiftUI with AppKit window physics, it delivers a low resource footprint alongside an elegant translucent interface.

---

## Table of Contents
1. [Core Audio Engine & Performance](#1-core-audio-engine--performance)
2. [Playback Controls & Modes](#2-playback-controls--modes)
3. [Library & Audio Sources](#3-library--audio-sources)
4. [Detachable Floating Player & Window Physics](#4-detachable-floating-player--window-physics)
5. [User Interface & Visual Design](#5-user-interface--visual-design)
6. [Interactive Lyrics Viewer](#6-interactive-lyrics-viewer)
7. [macOS System Integration](#7-macos-system-integration)
8. [Settings & Automation](#8-settings--automation)
9. [Persistent Loved Tracks Database](#9-persistent-loved-tracks-database-echolovedsongsdb)
10. [Intelligent Compilation & 'Various Artists' Song Artist Parsing](#10-intelligent-compilation--various-artists-song-artist-parsing)
11. [High-Performance Virtualized Library Architecture](#11-high-performance-virtualized-library-architecture-nstableview)
12. [10-Band Equalizer](#12-10-band-equalizer)

---

## 1. Core Audio Engine & Performance

- **Native Audio Pipeline**:
  - Built on Apple’s native `AVFoundation` and `AVPlayer` / `CoreMedia` stacks for zero audio distortion and maximum power efficiency.
  - Native playback support for all major audio formats: MP3, AAC, M4A, ALAC (Apple Lossless), FLAC, AIFF, and WAV.
- **Resource Usage** (measured on a Mac mini M1, 8 cores; CPU as Activity Monitor shows it, 100% = one core; memory = physical footprint):
  - **CPU**: ~10% playing on the Mac, ~20% streaming lossless over AirPlay (Echo's engine decodes, mixes and EQs the stream itself) — roughly 1–3% of the whole CPU.
  - **Memory**: ~45 MB playing a small folder (~80 songs), ~77 MB just after loading a ~8,000-song Music library, ~100 MB while streaming over AirPlay, and up to ~140 MB after several hours with a large library (memory macOS keeps for reuse after the library and playback buffers are freed; a relaunch returns to the baseline). No leaks found.
  - **Buffered Playback**: 10-second bounded audio buffer pipeline to eliminate memory bloat on high-bitrate lossless audio.
- **Hardware Media Key Interception (`MediaKeyManager`)**:
  - Intercepts macOS system hardware media keys (Play/Pause `NX_KEYTYPE_PLAY`, Next `NX_KEYTYPE_NEXT`, Previous `NX_KEYTYPE_PREVIOUS`).
  - Automatically claims the active Now Playing session so hardware media keys control Echo directly instead of accidentally launching or resuming Apple Music / iTunes.
  - Hardware event debounce mechanism prevents double-trigger anomalies.
- **AirPlay & Device Routing**:
  - Integrated native `AVRoutePickerView` directly in the footer bar.
  - **One output button** (right of the volume slider) opens Echo's output menu: *System Output* (follow the Mac's sound output), every connected local device — built-in speakers, **Bluetooth**, USB, HDMI/DisplayPort — and **AirPlay…**, which opens the system AirPlay list (AirPlay speakers, HomePods, Apple TV). A local device is used just for Echo (`AVPlayer.audioOutputDeviceUniqueID` on both crossfade players), so other apps keep the Mac's output; EQ, crossfade and lowering for other apps work as on the Mac speakers, and the slider is Echo's own level. Bluetooth speakers Echo has seen stay in the menu while they're off, greyed out as *"{name} Not Connected"*. A chosen speaker that disconnects does the same while Echo uses System Output, and is used again when it reconnects (devices are watched live). While AirPlay is active it wins (the menu says so; switch back with AirPlay… → the Mac). The speaker icon left of the slider shows where Echo is playing (AirPlay, the chosen device's kind, or the Mac). Bluetooth adds its usual ~150–250 ms delay, so the visualiser and synced lyrics can run slightly ahead.
  - **Separate volumes for the Mac and AirPlay**: over AirPlay the volume slider shows and sets the speaker's own volume (picked up from the speaker on connect, never pushed onto it); when AirPlay ends, Echo returns to the Mac level you last used. Only the Mac level is saved.
- **Dual-Player Gapless Crossfade**:
  - Seamless DJ-style crossfading between tracks utilizing dual coordinated `AVPlayer` instances (`activeAudioPlayer` and `standbyAudioPlayer`).
  - **Loudness-linear fades** (`gain = progress^1.67`, from perceived loudness ≈ amplitude^0.6): each song's loudness changes at a steady rate over the whole crossfade, so the outgoing song audibly fades from the first second instead of holding near full volume until the end (as an equal-power cos/sin curve does), while the two songs' perceived loudness still adds up to about the same total.
  - High-precision 50ms updates for smooth audio curves without volume steps.
  - Dynamic artwork crossfade synchronized directly with audio gain: incoming artwork smoothly dissolves in during the transition and seamlessly hands over with zero card-flip jitter.
  - **Customizable Duration**: Dedicated drag bar in Settings under Playback allowing precise adjustment between 6.0s and 12.0s (0.5s increments), saved in `UserDefaults`.
  - **Over AirPlay — Echo's own audio engine (experimental)**: an AirPlay receiver plays a single stream, and AVPlayer neither overlaps two players there nor sends compositions, so while Echo's AirPlay route is active playback moves to `EchoAudioEngine`. It decodes songs with `AVAssetReader` to Float32 stereo 44.1 kHz, mixes the outgoing and incoming song with the same loudness-linear fades (or joins them gaplessly when crossfade is off), runs the EQ over the mix and enqueues it on one continuous `AVSampleBufferAudioRenderer` timeline routed to the AirPlay speaker through its output context. Decoding stays at most **30 s ahead** of playback: uncapped, the AirPlay renderer accepts minutes of uncompressed audio (~21 MB per minute; Echo's memory jumped from ~77 MB to ~180 MB). The engine asks Echo for the next song shortly before it's needed (relative to the song it has decoded up to), reports when playback reaches it (mid-crossfade), and maps the playhead back to song time for the progress bar. Switching the output between the Mac and the AirPlay speaker moves playback between AVPlayer and the engine at the same position.

---

## 2. Playback Controls & Modes

- **Standard Transport Controls**:
  - Play / Pause (Spacebar shortcut).
  - Next Track (Right Arrow shortcut).
  - Previous Track (Left Arrow shortcut; restarts the current track if played past 3 seconds).
- **Interactive Scrubber & Timestamps**:
  - High-precision progress slider with real-time seek capability.
  - Monospaced elapsed and total duration readouts.
  - **Crossfade Marker**: when a crossfade into the next song will happen, a small tick on the progress bar marks where it starts, with a faint band to the end of the song showing the overlap (hover for the exact time). It follows the same rules as playback: crossfade on, a next song queued, no "Song Ends" timer, long enough songs locally, and the fade length capped at half the song for Echo's AirPlay engine.
  - **Audio Format Label**: a small pill between the two times shows the playing file's format — e.g. `FLAC 24/192`, `ALAC 16/44.1`, `AAC 256 kbps`, `MP3 320 kbps`. Hovering it shows a bubble with full details: codec, Lossless / Hi-Res Lossless / Lossy, bit depth, sample rate, channels, average bitrate and file size. FLAC is read from `STREAMINFO`; other formats from the AVFoundation audio format description (ALAC bit depth from its format flags). Probed off the main thread on every track change.
  - Component-isolated architecture (`PlaybackProgressView`) preventing unnecessary full-view re-renders.
- **Smart Shuffle Modes**:
  1. **Off**: Consecutive playlist order.
  2. **Shuffle All**: Randomized playback across the entire library (even when viewing the Favourites or Loved tab).
  3. **Curated Shuffle**: Shuffle restricted to **Favourites** (`star.fill`, Music's favorites) for the Apple Music source, or to **Loved** (`heart.fill`) for the Podcasts and Folder sources.
  - **Nothing is pre-selected** after launch or a source switch ("No Audio Playing"); pressing Play starts the selected tab or playlist — its first song with shuffle off, a random one when shuffling.
  - **With a Music playlist selected**, playback always stays inside that playlist: Off plays it in the playlist's order, and both shuffle modes shuffle just the playlist. The shuffle button's tooltip says so.
- **When Other Apps Play** (Settings › Playback › When Another App Starts Playing: Do Nothing / **Lower Volume** (default) / Pause Playback):
  - Echo notices when another app — a browser tab, a call, a video — is playing sound: Core Audio's process list says which apps are sending audio to an output, and a private process tap on just those apps measures whether they're actually audible (above about −50 dB). The tap needs the one-time **System Audio Recording** permission; Echo only measures loudness and records nothing. Without it, any app with an open output counts. Echo itself and background audio helpers (Rogue Amoeba, Core Audio, system sounds) are ignored; another app has to play for 1 s before it counts (notification blips don't), and be quiet for 2 s before Echo comes back. It only watches while Echo is playing (or paused for another app). Everything here works on macOS 14.2 and later.
  - **Lower Volume**: on the Mac's speakers Echo fades to 7 % (about −23 dB) in ½ s and back up in 1½ s; crossfades follow the lowered level. Over AirPlay (Echo's button or system AirPlay) the **speaker's own volume** is lowered to about 35 % of the slider — AirPlay speakers ignore Echo's output level — while the slider stays where you left it; moving it keeps the speaker lowered relative to it, and quitting Echo restores the speaker first.
  - **Pause Playback**: Echo pauses and resumes by itself once the other app goes quiet — unless you pressed Play meanwhile.
  - Limitation without the System Audio Recording permission: an app that keeps its audio output open while silent (e.g. Chromium browsers for ~30 s after a video pauses) still counts as playing.
- **Repeat Options**:
  - **Off**: Stops playback at playlist conclusion.
  - **Repeat All**: Loops entire playlist continuously.
  - **Repeat One**: Loops the currently active track indefinitely.
- **Sleep Timer**:
  - Adjustable sleep timer options: 1, 2, 3, 4, or 5 hours.
  - **Episode / Song End Option**: Pauses playback when the current track finishes — "Episode ends" in Podcasts mode, "Song Ends" for music (crossfade is skipped so the song plays out fully).
  - Header bed icon fills in while a timer is armed; hovering it shows a bubble with the live remaining time (e.g. "Pauses in 45 m" or "Pauses when the song ends").
  - One-click cancellation from the sleep menu.

---

## 3. Library & Audio Sources

- **One Source at a Time**: Echo's library is exactly one of the **Music app library**, **Apple Podcasts** or a **music folder** (one or more folders chosen together). Sources are never mixed; change it with **Switch Media Source…** (Settings › Library, or the song-count menu), which clears the current library first.
- **Apple Music Library Mode**:
  - Plays your locally stored, Music-managed library of your own DRM-free files; the songs are listed from the Music app's library database (`ITLibrary`) with fast, instant indexing.
  - Single-pass favourite tracks integration and non-blocking metadata inference ensuring sub-second switches.
- **Apple Podcasts Mode**:
  - Direct integration with Apple Podcasts database (`MTLibrary.sqlite`) in read-only mode.
  - Automatically resolves internal UUID-named cached episode files (e.g. `8618A1F3-...mp3`) to actual human-readable episode titles, podcast show names, and host names.
- **Custom Folder Picker**:
  - Select any custom directory or external drive to scan and play audio files recursively.
- **Native FLAC Metadata**:
  - AVFoundation exposes no common metadata for FLAC, so Echo reads FLAC files directly (`FLACMetadataReader`): title, artist (falling back to album artist), album and lyrics from the Vorbis comments, the exact duration from `STREAMINFO`, and the embedded cover art from the `PICTURE` block (front cover preferred; base64 `METADATA_BLOCK_PICTURE` comments are also supported).
  - Folder scans read only the metadata header (a few KB per file, in parallel), so FLAC tracks are listed with their real artist, album and duration even in `Album/CD 1/track.flac` layouts; cover art is loaded only when a track plays, crossfades in or flips onto the card.
- **Playlist Organization & Filtering**:
  - Filter menu: **All Songs**, then **Favourites** (Apple Music source) or **Loved** (Podcasts / Folder sources).
  - **Music Playlists**: for the Apple Music source, every playlist from the Music app (regular and smart, excluding built-in lists and folders) is listed under *Music Playlists* in the filter menu with its song count; choosing one shows its local songs in the playlist's own order, and the filter button shows the playlist name. Playlists refresh with every library scan.
  - Real-time search bar to instantly query by title, artist, or album.
  - **Library Drawer**: the chevron capsule under the volume slider opens the library below the player (the window grows 280 pt taller, using the same drawer animation as Lyrics and Settings), keeping Now Playing visible at all times. See *Player Layout* in section 5 for what's in it.
  - **Auto-Scroll to Playing Song**: Whenever the library drawer slides out or the playing track changes, the library list automatically scrolls and centers on the currently playing song (`anchor: .center`). If the track was filtered out by an active search query or inactive tab, visibility is automatically ensured so the song is always immediately located.
  - **Return to Playing Song**: After scrolling the playing song out of view, the list glides back to it 2 seconds after the last scroll (wheel, trackpad, momentum or scroller drag). Every scroll restarts the countdown; nothing happens while the song is still fully visible or filtered out, and clicking a song or skipping cancels the pending return.
- **Song Info View**:
  - Hovering any song in the library swaps its duration for an ⓘ button; clicking it slides a song info card in over the list (back with *‹ Library* or Esc; closing the library resets it).
  - **Header**: cover art, title, artist, album and the audio format pill.
  - **Song**: title, artist, album, album artist, year, genre, track and disc numbers ("3 of 12"), composer, label, copyright, ISRC and comment — whichever the file has.
  - **Audio**: format, Lossless / Hi-Res Lossless / Lossy, bit depth, sample rate, channels, bitrate and duration.
  - **Echo**: ★ Music favourite status (Apple Music source) or ♥ loved status (Podcasts / Folder sources), and where lyrics come from (local `.lrc` / `.txt`, embedded, online or none).
  - **File**: name, folder, size, added and modified dates; values are selectable for copying. Toolbar actions: *Play* and *Show in Finder*.
  - Tags are read from the file itself (FLAC Vorbis comments, or iTunes / ID3 / QuickTime metadata via AVFoundation) with Spotlight filling any gaps; everything loads off the main thread.
- **★ Favourites — synced with the Music app (Apple Music source)**:
  - The star next to the song title and the library row's right-click *Favourite in Music* / *Remove from Favourites* set the Music app's own favorite flag (the ★ in Music), matched by the track's persistent ID.
  - Reading needs Music running: Apple's library API (`ITLibrary`) has no favorite flag (checked against a starred song), so Echo asks Music via AppleScript — after every library scan, when the library drawer opens (at most every 20 s), when Music launches, the moment you switch away from Music, and every minute while Music runs. With no favorites at all Music reports an error instead of an empty list; Echo reads that as "none". Until the first successful read, the "Favourite" playlist is used as a fallback. Playlists don't need Music: they come from `ITLibrary`.
  - Changes show instantly in Echo. If Music isn't running they're queued on disk (surviving quit and restart) and sent when Music runs. A line under the library search shows *"N ★ changes waiting for Music"* with **Send Now** (starts Music hidden, saves them, quits it again), or *"Echo isn't allowed to change ★ in Music"* with **Allow…** (opens Privacy & Security › Automation) if macOS refuses.
  - **Sync ★** (Settings › Library, Apple Music source, off by default; a note below it explains what it does): 5 s after the last ★ change while Music is closed, Echo starts Music hidden, writes the queue, reads Music's stars and quits Music again — only if Echo started it and you haven't switched to it. Scripting runs in an `osascript` process off the main thread; macOS asks once for permission (*Echo wants to control Music*).
  - Echo never stars songs in Music on its own: ★ changes only come from the ★ button or the library's context menu. (An earlier one-time ♥ → ★ migration was removed after it re-ran unexpectedly.)
- **♥ Loved (Podcasts and Folder sources)**:
  - Quick Love/Unlove heart toggle (`heart.fill`) on the player and in playlist rows; not shown for Apple Music songs, which use ★ instead.

---

## 4. Detachable Floating Player & Window Physics

- **Dual-Mode Presentation**:
  - **Menu Bar Popover**: Unobtrusive panel anchored under the macOS menu bar icon (an AppKit `NSStatusItem` with its own panel, `MenuBarController`). It closes on a click outside Echo, on Esc (unless typing), or on a second click of the icon; Echo's own popovers, colour panel and dialogs keep it open.
  - **Detached Desktop Floater**: Pop out the player into a standalone floating desktop widget using the Pin button (`pin` / `pin.fill`) or by dragging.
- **Compact Player**:
  - The header's compact button (`rectangle.compress.vertical` / `rectangle.expand.vertical`) hides the artwork / visualiser block: the player shrinks from 480 to 270 pt, with a 40 pt cover thumbnail beside the left-aligned title and artist. It works in the menu bar panel and the floating player, animates with the drawer timing (top edge fixed; the floater keeps its edge margins), and is remembered between launches. The Library drawer still opens below it (550 pt total).
  - While compact, the **Visualizer**, **Lyrics** and **Settings** header buttons (and the lyrics bubble by the title) are disabled and drawn in a dim neutral grey that's never tinted by the accent; open Settings / Lyrics drawers close when compact turns on, and so does the Library, so switching to compact always gives the small 270 pt player (the Library can be opened again from the chevron afterwards). Window sizes for the player, panel and floater come from one place (`PlayerViewModel.windowWidth` / `windowHeight`).
- **AppKit Hardware-Accelerated Dragging**:
  - Powered by native `performDrag(with:)` for smooth 60fps/120fps ProMotion dragging without latency or stutter.
- **Tactile Cursor Affordance**:
  - Hovering over grabbable surfaces automatically changes the pointer to an **Open Hand** (`NSCursor.openHand`).
  - Pressing and moving the window smoothly shifts to a **Closed Hand** (`NSCursor.closedHand`).
- **Expanded Grabbable Surface Areas**:
  - Drag from the top header channel between the track count and sleep timer.
  - Drag from the upper corridor directly above the album artwork.
  - Drag directly from the artist name and surrounding text area.
  - Drag from the gap between the transport controls and the volume footer.
- **Full-Edge Drag Freedom & Elastic Spring-Bounce Release**:
  - **Move All the Way to the Edge**: While dragging, the window moves smoothly all the way to any screen edge, corner, and right on top of the Dock (prevented from ever entering the Dock or clipping offscreen).
  - **Elastic Bounce Back on Release**: Releasing the window anywhere at the edge or within the snap zone triggers a two-phase physical spring bounce (`0.18s` `.easeOut` overshoot followed by `0.18s` damped rebound `controlPoints: 0.25, 1.25, 0.5, 1.0`), springing cleanly away from the edge back to the allowed **35-pixel margin** where it firmly sticks.
  - **Dynamic In-Drawer Repel**: Opening or collapsing in-window drawers (Settings, Lyrics, or Library) while detached in any corner or edge rigorously preserves the 35px boundary with fluid spring easing (`CAMediaTimingFunction(controlPoints: 0.16, 1.0, 0.3, 1.0)`). When expanded in a corner (e.g., bottom-right), the window smoothly expands outward to the left and anchors with the exact 35px margin, preventing screen edge clipping.
  - **Strict Dock & Menu Bar Clearance**: Enforces an exact 35-pixel clearance envelope above the macOS Dock (dynamically tracking Dock presence, position, and height) and 35-pixel margin below the Menu Bar, preventing the floater from ever penetrating or overlapping the Dock during dragging, snapping, or drawer transitions.
- **State & Coordinate Persistence**:
  - Automatically saves detached state and exact window screen coordinates to `UserDefaults`.
  - Restores the floating panel at its exact saved position when relaunching the app, and starts it full size with the Library open (the menu bar panel still opens without it).
- **Contextual Menu Bar Behavior**:
  - When detached, clicking the menu bar icon opens a native macOS menu with *"Attach Floater"* and *"Quit Echo"* (⌘Q). Right-clicking the icon opens the same menu at any time (just *Quit Echo* while attached).

---

## 5. User Interface & Visual Design

- **Player Layout** (top to bottom; 320 × 480 pt, or 320 × 270 pt in the compact player):
  - **Header row**:
    - **Song count** (left), e.g. *"7 881 songs"*: shows the count for the selected tab or playlist (songs, favourites, loved or episodes). Hovering brightens it and shows *"Resync or Switch Source"*; clicking opens a small menu with **Resync Library** and **Switch Media Source…** (the same actions as in Settings › Library). While a scan runs it shows *"Scanning library…"*.
    - **Icons** (right), in order:
      | Icon | Action |
      |---|---|
      | Compact (`rectangle.compress.vertical` / `.expand.vertical`) | Full ⇄ compact player |
      | Bed (`bed.double`) | Sleep timer menu: 1–5 hours or *Song Ends*; while active, hovering shows the remaining time |
      | Waveform | Artwork ⇄ sound wave visualizer |
      | Sliders (`slider.vertical.3`) | Equalizer popover (right-click for presets and on/off) |
      | Quote bubble | Lyrics drawer |
      | Pin | Detach as a floating player / attach to the menu bar |
      | Gear | Settings drawer |
    - Active icons use the accent colour. In the compact player the visualizer, lyrics and settings icons are disabled and drawn in a dim neutral grey.
  - **Artwork or visualizer** (hidden in the compact player): the album cover as a two-sided card that flips forward or back on track changes, or the sound wave visualizer (click it to cycle styles). Hovering the cover shows a lyrics badge.
  - **Title row**: song title with **★** (Music library: the Music app's favourite flag) or **♥** (Folders / Podcasts: Echo's Loved list), plus a lyrics bubble when lyrics exist; artist below. In the compact player a 40 pt cover thumbnail sits to the left and the text is left-aligned.
  - **Progress bar**: elapsed and total time, a **format pill** (e.g. *"ALAC 16-Bit/44.1 kHz"*, *"AAC 256 kbps"*; hover for full details) and, when a crossfade is coming, a **crossfade marker** (a tick where it starts plus a tinted band to the end).
  - **Transport**: shuffle (off / all / Favourites or Loved only), previous, play/pause, next, repeat (off / all / one). Keyboard: `Space` play/pause, `←` previous, `→` next.
  - **Volume row**: speaker icon (shows AirPlay or muted), volume slider (the Mac's level, or the speaker's own volume over AirPlay), and the **AirPlay** button on the right.
  - **Library toggle**: the small chevron capsule under the volume opens or closes the library below the player.
- **Library Drawer** (opens below the player, +280 pt):
  - **Search bar** with an embedded **filter menu** (All Songs, Favourites or Loved, and the Music app's playlists by name); the button shows the selected playlist's name.
  - **Status line** (Music library only, when relevant): *"N ★ changes waiting for Music"* with **Send Now**, or *"Echo isn't allowed to change ★ in Music"* with **Allow…**.
  - **Song list**: the playing song is highlighted. With **Jump to Song** on (Settings › Library, default) the list scrolls to it on every track change and glides back 2 s after you scroll away; with it off the list stays where you leave it (it still centres the playing song when the library opens or the filter changes). Hovering a row shows, in place of the duration, a **★** (Music library: favourite in the Music app) or **♥** (Folders / Podcasts: Loved) toggle — filled when the song is marked, an outline otherwise — and an **ⓘ** button that slides the song info card over the list. Right-click a row for *Favourite in Music* / *Remove from Favourites* (Music library) or *Love Track* / *Unlove Track* (Folders, Podcasts).
- **Side Drawers** (open to the right, +341 pt): **Lyrics** and **Settings** share one drawer; opening one replaces the other.
- **Menu Bar Icon**: click to open the attached player under the icon; while the player floats, or on right-click, a menu offers **Attach Floater** (when floating), **Check for Updates…** and **Quit Echo** (⌘Q).

- **Appearance Themes** (Settings → Experience):
  - **Match System Appearance** (default on): Dark Mode follows macOS, including live switches such as Auto appearance at sunset (observes `NSApp.effectiveAppearance`). The Dark Mode toggle is greyed out while matching; turning matching off makes it manual.
  - **Dark Mode**: solid dark grey window (`#212124`) with a choice of six accents — **Amber** (default), Coral, Mint, Sky, Lavender, Rose — tuned to similar brightness, plus a **custom colour** (rainbow circle, opens the macOS colour panel; changes apply live). The active lyric line uses a brighter variant of the accent.
  - **Light Mode** (default on): solid, softly muted ivory window (`#E8E2D0`) with six earthy accents — **Terracotta** (default), Olive, Teal, Ink Blue, Plum, Crimson — all with at least 4:1 contrast on ivory, plus a separate custom colour. Ivory always uses light styling, even if macOS is dark. With Match System Appearance off, Light Mode and Dark Mode are mutually exclusive: switching one on switches the other off. While matching a dark macOS, the Light Mode toggle shows off and greyed; the saved choice returns when macOS turns light.
  - **Classic Translucent Glass**: with Light Mode off, the light appearance uses native macOS `regularMaterial` and the system accent colour.
  - Accents tint buttons, sliders, toggles, progress bar, visualizer, equalizer and the AirPlay icon. The curated (Favourites / Loved) shuffle icon is orange by default and follows any non-default accent; its heart badge always stays red.
  - Continuous rounded corners (16pt corner radius when detached).
- **Smooth Drawer Animations**:
  - SwiftUI content and the AppKit window resize share one timing curve (`DrawerAnimation`: 0.35s, `timingCurve(0.16, 1.0, 0.3, 1.0)`), so the content edge and window edge move together.
  - Settings and Lyrics share one side-drawer container: it slides in and out on open/close, and swapping between drawers cross-fades in place.
  - The menu bar window is never snapped to its final size mid-animation, and the floating window's hosting view does not drive the window size.
- **Dynamic Ambient Glow & Adaptive Blur**:
  - Real-time ambient light reflection generated from the dominant hues of the currently playing album artwork with smooth blur (radius 50) and saturation enhancement.
  - Smoothly blurred artwork melted perimeter (radius 20) around the album art frame.
  - **User Configurable**: Can be toggled on/off in Settings under Experience with smooth crossfade animation and persisted across launches in `UserDefaults`. When toggled off, provides a clean, flat aesthetic.
- **Real-Time Sound Wave Visualizer (9 Switchable Engine Styles)**:
  - Rendered on a display-synced `CADisplayLink` capped at 60 fps (smoothing is tuned per frame, so ProMotion displays don't speed it up).
  - Songs are only analysed (decoded for levels and the beat grid, a few seconds of one core per song) while the visualiser is showing; with artwork shown nothing is decoded, and switching to the visualiser analyses the playing song on the spot. The display link stops by itself while the player is hidden.
  - Accessible via waveform button in header or clicking the visualizer card to cycle through 9 styles:
    1. **Fluid Wave**: Multi-layered organic sinusoidal waves with luminous crests.
    2. **Aurora**: Billowing northern lights curtains with soft ceiling compression to eliminate flat tops.
    3. **Neon Ribbon**: Additive chromatic luminescence ribbons with high-frequency harmonic flutter.
    4. **Orbital Pulse**: Radial sonar resonator pulsing dynamically with bass energy.
    5. **Oscilloscope**: Analog CRT vector phosphor display with phosphor decay lag.
    6. **Pulse Bars** *(beat-synced)*: mirrored rounded bars with a centre-bright gradient that kick on every beat, with peak caps that drop with gravity.
    7. **Ripple Bloom** *(beat-synced)*: a wobbling glowing core that swells with the bass and sends out a fading ring on every hit, plus a slowly turning dashed orbit.
    8. **Bouncing Dots** *(beat-synced)*: a row of dots that hop on each hit in a wave travelling left to right, joined by a glowing string, with soft floor shadows that shrink as they rise.
    9. **Sunburst** *(beat-synced)*: a ring of rays around a glowing core that bursts on each beat and turns in time with the tempo (one revolution every 16 beats), with sparkles on the longest rays.
  - **Beat & Tempo Analysis** (for the beat-synced styles): computed once per track from the already-decoded audio — an onset envelope (rises in bass and loudness against a local average), tempo from its autocorrelation over 60–190 BPM (weighted towards ~120 BPM and checked against 2× / 4× bar periods to avoid locking onto off-beat subdivisions), a beat grid aligned to the strongest onsets, and a list of real hits. The bounce follows whichever is stronger at any moment — the tempo grid or an actual kick — so it stays on the music even when the tempo estimate is off; ripple rings and dot hops fire on real kicks and fall back to the grid in passages without them. Intentionally approximate: it aims to look musical, not to be a beat tracker.
- **3D Card Flip Animation**:
  - Interactive two-sided 3D flipping card effect on track transitions.
  - Flips smoothly forward or backward matching track navigation direction.
- **Optimized Artwork Caching**:
  - Embedded artwork downsampled to exact screen display dimensions on ingest, conserving GPU texture bandwidth and system RAM.

---

## 6. Interactive Lyrics Viewer

- **Slide-Out Lyrics Drawer**:
  - Clicking the album cover art or the lyrics quote bubble (`quote.bubble.fill`) smoothly expands the window (320 pt to 661 pt) with a slide-out lyrics panel using the shared drawer animation (`DrawerAnimation`, 0.35s).
  - Mutually exclusive with the settings drawer so opening one closes the other seamlessly.
  - Displays a clean close button (`xmark.circle.fill`) and hover affordance on the album art.
- **Full Lyrics Display & Karaoke Tracking**:
  - Displays the entire song lyrics in a smooth vertical scroll view, rather than only the current line.
  - **Styled like a lyrics sheet**: every line is 17 pt bold rounded (so nothing reflows as the song moves on); the active line pops with a gentle 6% spring scale, full accent colour and a soft glow; other lines fade with their distance from it (neighbours stay readable) and lines more than two away get a slight blur. The list fades out at the top and bottom edges. Plain (unsynced) lyrics use 15 pt.
  - Automatically scrolls to and centers the active lyric line as the song progresses. The list is padded by half the drawer height above and below, so the active line stays at the vertical middle all the way through, including the first and last lines.
  - Clicking any synchronized line instantly seeks audio playback to that timestamp.
- **Adaptive Color Scheme**:
  - **Dark Mode**: Highlights the active line in a brighter variant of the chosen accent (Amber default: warm golden-orange `#FFAE26`) with a soft radiant glow.
  - **Light Mode (ivory)**: Highlights the active line in the chosen light accent (Terracotta by default).
  - **Classic translucent look**: Highlights the active line in vibrant system blue (`#007AFF`) matching the native controls.
  - Inactive lines rendered with clean secondary legibility for reading upcoming or past verses.

---

## 7. macOS System Integration

- **Now Playing & Lock Screen Integration**:
  - Full registration with `MPNowPlayingInfoCenter`.
  - Displays high-resolution artwork, track title, artist, album name, elapsed time, and total duration in macOS Control Center and Lock Screen.
- **Native Notifications**:
  - Optional banner notifications on track changes featuring the album artwork thumbnail, song title, and artist.
- **Launch at Login**:
  - Native `SMAppService.mainApp` toggle in settings to launch Echo seamlessly on Mac startup.
- **Dock & Mission Control**:
  - Configured as an accessory panel (`.nonactivatingPanel`, `.canJoinAllSpaces`, `.fullScreenAuxiliary`) to seamlessly overlay full-screen spaces without stealing application focus.

---

## 8. Settings & Automation

- **Automatic Updates (Sparkle 2)**:
  - Echo checks `https://disfiguredfanny.github.io/Updates/echo/appcast.xml` on the chosen schedule and only installs updates signed with Echo's EdDSA key (`SUPublicEDKey` in `Echo-Info.plist`). Scheduled update prompts are gentle (no window popping up over your work, since Echo has no Dock icon).
  - Settings › Application › **Check for Updates** toggles automatic checks; while it's on, centred Daily / Weekly / Monthly options (daily by default) appear below it. A manual **Check for Updates…** is in the menu bar icon's right-click menu.
  - Releases are published with `make-release.sh`: macOS 15+ universal build, signed zip attached to a GitHub release in the public Updates repo, and a new entry at the top of `echo/appcast.xml` (with minimum macOS version and release notes).

- **In-Window Animated Settings Drawer**:
  - Clicking the gear icon in the top header smoothly expands the player window to the right (320 pt → 661 pt; the Settings / Lyrics drawer is 340 pt wide) using the shared drawer timing for SwiftUI content and the AppKit window resize.
  - Gear icon features rotating animation (60°) and dynamic theme tinting when active.
  - Integrates all settings directly into the player interface:
    - **Experience**: Match System Appearance, Dark Mode (with accent colours), Light Mode (with accent colours), Adaptive Blur.
    - **Playback**: Crossfade toggle with its 6–12 s duration slider; over AirPlay a note says *"Experimental over AirPlay"*.
    - **System**: Song Notifications and Launch at Login (`SMAppService`).
    - **Lyrics**: online lyrics service — LRCLIB, NetEase or Auto (tries both).
    - **Library**: *Resync Library*, *Switch Media Source…*, **Jump to Song** (library follows the playing song) and, always last, **Sync ★** (Music library only; note: *"Opens Music app in background to save ★"*).
    - **Application**: **Check for Updates** toggle, with Daily / Weekly / Monthly below it while on; *About*; *Quit*.
  - Fluid close animation via header close button (`xmark.circle.fill`), gear toggle, or source switcher.
- **Quick Keyboard Shortcuts** (while the player is focused):
  - `Space`: Play / Pause.
  - `Left Arrow`: Previous track, or back to the start if more than 3 s in.
  - `Right Arrow`: Next track.

---

## 9. Persistent Loved Tracks Database (`~/.echo/lovedsongs.db`)

- **Hidden User Folder & Persistence Beyond App Removal**:
  - Automatically creates a hidden directory `.echo` inside the user home folder (`~/.echo/`).
  - Saves all loved tracks to `~/.echo/lovedsongs.db`.
  - Sits completely outside `~/Library/Application Support`, `~/Library/Preferences`, and sandboxed containers, ensuring that third-party app cleaners (e.g. CleanMyMac, AppCleaner, Pearcleaner) will never delete or wipe loved tracks when uninstalling or updating the app.
- **Startup File Path Verification & Acceptance**:
  - On app launch, Echo looks for `~/.echo/lovedsongs.db`.
  - For each saved track, verifies that its file path is working, existing, and readable on disk.
  - Only tracks with working file paths are accepted into active loved sets and playlists.
  - Preserves records for offline or unmounted drives so paths are not purged accidentally.
- **Rich Structured Format**:
  - Stores full track metadata: `path`, `title`, `artist`, `album`, `date_loved`, and category (`music` vs `podcasts`).
  - Cleanly indented and formatted for human inspection (`cat ~/.echo/lovedsongs.db` or `jq`).
- **Resilient & Fault-Tolerant Multi-Format Parser**:
  - Parses structured JSON databases, simple JSON arrays, or plain-text file lists with comments.
  - Hand-edits in `lovedsongs.db` are gracefully supported without risking data loss.
- **Library Healing & Auto-Match**:
  - If tracks are moved or reorganized across directories, matches tracks by `(artist, title)` fallback and auto-heals their updated paths.
- **Scope**: loved songs apply to the Podcasts and Folder sources; Apple Music songs use the Music app's ★ favorites instead (see Library & Audio Sources).
- **Instant Actions & Context Menu**:
  - One-click love/unlove via the heart icon in the main player header.
  - Right-click context menu (`Love Track` / `Unlove Track`) on any row in the playlist drawer.
  - Atomic, background disk synchronization ensures zero UI frame drops.

---

## 10. Intelligent Compilation & 'Various Artists' Song Artist Parsing

- **Actual Song Artist Extraction**:
  - Solves the common compilation issue where albums tagged with Album Artist as *"Various Artists"*, *"Various"*, *"V.A."*, or stored in `Compilations`/`Various Artists` directories display *"Various Artists"* instead of the song's actual performer.
  - The library parser automatically extracts and displays the **actual song artist** for every individual track.
- **Multi-Tier Artist Resolution Pipeline**:
  1. **Primary Apple Music Database Ingest**: Prioritizes `ITLibrary` media item metadata, which directly provides exact track-level performers (`ITLibMediaItem.artist.name`) even when `ITLibAlbum.albumArtist` is *"Various Artists"*. Requires Media & Apple Music access (`NSAppleMusicUsageDescription`); if the database can't be read, the failure is logged (Console: `LittleHelpers.Echo` › `Library`) and Echo falls back to a filesystem scan.
  2. **Filename Pattern Parsing**: Parses standard compilation naming conventions (e.g. `"01 - Artist - Title"`, `"1-12 Artist - Title"`).
  3. **Directory Inference**: Uses the folder above the album (`Music/Artist/Album/track`), filtering out compilation container names (*"Various Artists"*, *"Compilations"*, *"Soundtracks"*, *"OST"*) so they never pollute track artist fields.
  4. **Last-Resort CoreServices/Spotlight Extraction**: Tracks still unresolved after steps 2–3 (typically Apple Music's `Compilations/` and `Various Artists/` folders, whose files are named `"01 Title.m4a"`) read `kMDItemAuthors` via `MDItemCreateWithURL`, in parallel across all cores during the scan and before sorting (~1.6 s for ~5,600 files on an M1). Used by the filesystem scan and Custom Folder sources.
  - When a track's artist can't be found anywhere it stays *"Unknown Artist"* (music tracks never show the album name in its place; podcast caches fall back to the show name).
- **Full Search & Sorting Fidelity**:
  - Searching for an individual artist instantly finds their songs across all compilation albums, soundtracks, and multi-artist collections.
  - Tracks are sorted alphabetically by actual song performer rather than collapsing under thousands of duplicate *"Various Artists"* entries.

---

## 11. High-Performance Virtualized Library Architecture (`NSTableView`)

- **True Cell View Recycling (~15 Reusable Rows)**:
  - Replaced SwiftUI `LazyVStack` and `ScrollViewReader` with an AppKit `NSTableView` via `NSViewRepresentable`.
  - Instead of instantiating thousands of view nodes in SwiftUI's `AttributeGraph` for 7,800+ songs, only ~15 row cells are kept in memory at any given time and recycled during scrolling.
- **O(1) Instant Centered Jump-to-Track**:
  - `scrollToRowCentered` performs an instant mathematical offset calculation (`row * rowHeight`), jumping to the currently playing song in **< 1 ms** with zero intermediate view layout traversal.
  - Eliminates main-thread hitching and animation frame drops during slide-out drawer transitions.
- **Hardware-Accelerated 120 FPS ProMotion Scrolling**:
  - Native AppKit scrolling engine with native momentum, zero CPU spikes, and smooth rendering across thousands of tracks.
- **Asynchronous Background Lyrics Probing**:
  - Probes `.lrc` and embedded lyrics asynchronously in a utility background queue, eliminating synchronous `stat()` filesystem checks on the main UI thread during row evaluation.
- **Precomputed Index Arrays**:
  - Cached `allIndices` prevents repeated allocation and deallocation of 7,800-element arrays during view body passes.
- **Library Memory Reduction & 0.0% Idle CPU**:
  - Moving the library to `NSTableView` cut total process dirty memory by **71%** at the time (from 240 MB to 69 MB), with `AttributeGraph` footprint dropping **98.4%** (from 64 MB to 1 MB). Current figures: see *Resource Usage* in section 1.
  - Eliminates the infinite 120 FPS status bar redraw loop, reducing idle CPU usage from 100% to **0.0%**.

---

## 12. 10-Band Equalizer

- **Equalizer Popover**:
  - Opened from the header button (`slider.vertical.3`) as a popover sized to its content (300 pt wide); the player window never resizes for it, and it can be used while the Settings, Lyrics or Library drawers are open. Closes with its close button or a click outside.
  - Uses the active theme's background (dark grey or ivory) and colour scheme.
  - Right-click the header button for quick preset switching and an on/off toggle without opening the drawer.
- **Audio Engine**:
  - Preamp plus 10 octave-spaced peaking bands (32 Hz – 16 kHz, ±12 dB, Q ≈ 1.41) running in an `MTAudioProcessingTap` on each player item.
  - Every player item gets its own filter state, so both players in a crossfade are equalized independently.
  - The real-time audio thread never blocks on the UI; parameter changes, on/off and bypass glide over a few buffers to avoid zipper noise and clicks.
- **Clipping Protection**:
  - **Limiter** (on by default) keeps the full boost and only turns the level down at the moments a peak would clip, recovering over ~150 ms. The same gain is applied to every channel, so the stereo image never shifts.
  - A soft **clip guard** stays transparent below −0.2 dBFS and smoothly saturates anything louder instead of hard-clipping.
- **Accurate Response Curve**: the curve is computed from the actual filters (including band overlap and preamp) on a logarithmic 20 Hz – 20 kHz axis.
- **Presets**:
  - 11 built-in presets (Flat, Podcast Voice Clarity, Bass Booster/Reducer, Electronic, Rock, Pop, Acoustic, Classical, Hip-Hop, Vocal Booster).
  - Save the current curve as a named preset and delete saved presets from the preset menu.
- **Separate Music & Podcasts Settings**: each library source keeps its own on/off state, curve and preset, switching automatically with the source.
- **Hold to Compare**: press and hold to hear the track without the equalizer; settings are untouched.
- **Accessibility**: all sliders are adjustable with VoiceOver (0.5 dB steps) and announce their value.
- **AirPlay**: the equalizer works over AirPlay too.
  - **Echo's AirPlay button** (AirPlay 2 buffered streaming): AVPlayer runs the audio — EQ included — far ahead of playback and the speaker buffers it, so changes would otherwise only be heard on the next song. Once the settings stop changing for ~0.6 s (0.15 s for *Hold to Compare*), Echo re-seeks to the current position so the speaker re-buffers with the new EQ; expect a delay of a second or two and possibly a brief gap. The panel shows *"Over AirPlay, changes take a moment to reach the speaker"*.
  - **System AirPlay output** (the Mac's sound output set to an AirPlay speaker): rendered live on the Mac, so the EQ applies immediately with no re-seek.
