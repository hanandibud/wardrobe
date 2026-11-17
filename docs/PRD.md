# Product brief

## One-liner

A local-first wardrobe that turns photos of your clothes into a searchable closet and, eventually, a daily outfit suggestion that respects the weather, the occasion, and what is actually clean.

## Problem

Getting dressed is a small decision with a lot of hidden work:

- You forget what you own, especially off-season pieces.
- Clothes live in baskets, drawers, and the back of the closet.
- Weather and occasion narrow the options, but the app in your head does not.
- Generic styling advice does not know your wardrobe, your taste, or your laundry day.
- Most wardrobe apps ask for a lot of manual data entry before they become useful.

## Target user

The first user is the builder: one person, one phone, one browser, a real closet, and a zero-dollar budget. The product should be useful on day one with 10–20 pieces, not after a 200-item catalog.

## Jobs to be done

1. **Capture:** When I bring home or wash a piece, I want to add it in under a minute so my wardrobe stays accurate.
2. **Find:** When I am planning a look, I want to search and filter my own pieces instead of guessing what is in the closet.
3. **Combine:** When I find a combination I like, I want to save it so I can repeat it without thinking.
4. **Decide:** When I am getting dressed, I want a suggestion that fits the weather and the occasion and only uses clean items.
5. **Improve:** When a suggestion is wrong, I want to give a simple signal so the next one is better.

## User stories

### M0 — capture and browse (done)

- As a user, I can add a piece with one photo and see it in my wardrobe after refresh.
- As a user, I can see colors detected from the photo and add or remove a color manually.
- As a user, I can set category, warmth, formality, seasons, availability, and notes.
- As a user, I can search by name or color and filter by category.
- As a user, I can open a piece, change its availability, or remove it.
- As a user, I know my photos stay in my browser.

### M1 — better catalog

- As a user, I can crop a photo so the garment fills the card.
- As a user, I can remove the background to get a clean cutout.
- As a user, I can edit any field after saving.
- As a user, I can export my wardrobe to a file and import it on another device.
- As a user, I can see a count of pieces by category and availability.

### M2 — outfits

- As a user, I can build an outfit from my own pieces.
- As a user, I can save, rename, and delete outfits.
- As a user, I can tag an outfit with an occasion and season.
- As a user, I can log that I wore an outfit today.

### M3 — daily suggestion

- As a user, I can allow location access and see the current weather.
- As a user, I get a small set of outfit suggestions for today.
- As a user, I can choose an occasion (casual, work, smart, formal).
- As a user, I can see why each outfit was chosen.
- As a user, I can say “wore it”, “skip”, or “loved it” to improve later picks.

### M4 — personalization and shipping

- As a user, I can set a color palette and undertone preference, and override it at any time.
- As a user, I can install the app to my home screen.
- As a user, I can use the app from a free GitHub Pages URL.
- As a user, I can back up and restore my data.

## MVP scope

In:

- Single local user
- Photo upload from camera or library
- Local storage, no account
- Automatic color extraction
- Wardrobe grid, search, filter, detail, delete
- Availability status
- Responsive mobile-first UI

Out:

- Multi-user accounts and sync
- Social sharing, shopping, affiliate links
- Native iOS/Android app
- Full outfit decomposition from one photo
- LLM chat styling
- Payments
- Claims that skin tone scientifically determines “flattering” colors

## Success criteria

- Add 10 pieces in under 5 minutes.
- After a refresh, every piece and photo is still there.
- A search or filter returns in under 100 ms for 200 local items.
- The daily suggestion (M3) returns in under 2 seconds.
- At least 70% of suggestions are worn or saved during a 7-day dogfood week.
- The app is usable one-handed on a 390 px wide screen.

## Risks

| Risk | Mitigation |
| --- | --- |
| Data entry is too slow | One photo, auto colors, sensible defaults, confirm-don't-type |
| Photos are too large for browser storage | Downscale to 1600 px and encode WebP before storing |
| Background removal is hard on worn outfits | Start with flat lays and one item per photo; add cutouts later |
| Recommendations feel random | Rules first, explain every suggestion, learn from simple feedback |
| Skin-tone advice feels gimmicky | Treat it as an editable preference, never a diagnosis |
| Scope creep | One milestone at a time; the roadmap is the contract |
| Browser storage is cleared | Export/import backup in M1 |
| Weather API terms change | Open-Meteo is isolated behind one module; easy to replace |

## Open questions

- Is manual crop enough for M1, or does background removal need to ship with it?
- Should cutouts be generated in the browser or by a local Python helper?
- Which signal is strongest for recommendations: color harmony, formality, or recency?
- How many items does the user need before a suggestion feels useful?
- Should the app stay local-first forever, or add optional sync once the core is solid?
