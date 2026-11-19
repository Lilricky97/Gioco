import { chromium } from 'playwright'
import fs from 'fs'
const liv = fs.readFileSync('/tmp/claude-0/-home-user-Gioco/3e81fad5-fd79-59db-b656-4038ae2efdc5/scratchpad/perc/livelli.js', 'utf8'), dis = fs.readFileSync('/tmp/claude-0/-home-user-Gioco/3e81fad5-fd79-59db-b656-4038ae2efdc5/scratchpad/perc/disegno.js', 'utf8')
const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 960, height: 400 } })
await p.setContent(`<body style="margin:0;background:#111;display:flex;gap:20px"><script>${liv}${dis}
for (let l = 0; l < PERCORSI.length; l++) { const d = document.createElement('div'); d.style.cssText='position:relative;width:300px;height:360px'; d.innerHTML = percSVG(l); document.body.appendChild(d);
  const c = document.createElement('canvas'); c.width=300; c.height=360; c.style.cssText='position:absolute;inset:0'; d.appendChild(c); const g = c.getContext('2d');
  for (let y = 0; y < 360; y += 3) for (let x = 0; x < 300; x += 3) if (!percTocca(l, x, y)) { g.fillStyle='rgba(0,255,120,.55)'; g.fillRect(x,y,1.5,1.5) } }
</script></body>`)
await p.screenshot({ path: '/tmp/claude-0/-home-user-Gioco/3e81fad5-fd79-59db-b656-4038ae2efdc5/scratchpad/perc/livelli.png' }); await b.close()
