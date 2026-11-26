[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/suchonamehzabin8-maker/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/suchonamehzabin8-maker/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

# Ridgeline Run

A bush-plane flight game that plays offline in a desktop browser. Take off from
a valley airstrip, thread 8 glowing rings — over the lake, through the mountain
pass — then bring her home and land on the runway. Rings refill your tank and
pay 500 points each. Mind the ridges and the fuel gauge: the valley forgives
no one, and an empty tank means a dead stick.

## How to play

Serve `game/` with any static server and open `game/index.html` in desktop
Chrome (for example `node serve.ts`, then http://localhost:8080). No network,
no build step, no install.

- **Mouse / Arrow keys** — steer and bank
- **W / S** — pitch up / down
- **Shift / Ctrl** — throttle up / down
- **Space / B** — brake
- **C** — chase / cockpit view
- **P** — pause · **M** — mute

The HUD shows a compass tape, airspeed and altitude tapes, an artificial
horizon, throttle and fuel gauges, the ring count, score and time. Fly through
all 8 rings, then land gently on the runway to complete the sortie. A hard
impact, a ridge or the lake ends the flight; a touch-and-go on the runway
refills the tank.

## How it is built

- `game/src/config.js` — tuning: the world, the flight model, the ring circuit
- `game/src/noise.js` — seeded noise and the one terrain height function
- `game/src/world.js` — terrain mesh, water, runway, rings and clouds
- `game/src/flight.js` — arcade flight physics, stalls, landings, the mission
- `game/src/render.js` — hand-rolled WebGL renderer, sky, plane and camera
- `game/src/hud.js` — compass, tapes, artificial horizon and gauges
- `game/src/input.js` — keyboard and mouse controls
- `game/src/audio.js` — synthesized engine, wind and chimes (WebAudio, no files)
- `game/src/main.js` — boot, game loop, screens and screenshot staging

`main.ts` (Node 22, standard library only) hands the entry in: it copies
`game/` and `screenshots/` to `/output` and writes `dossier.json` with the
vendored `vendor/makefun-game.ts`.

## License

MIT — see [LICENSE](LICENSE).
