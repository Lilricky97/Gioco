// Per test-sito.mjs: un "robot" che gioca i giochini 11-19 dell'avvento dentro la pagina (usa gli agganci per i test di ogni giochino).
window.__robot = {
  attendi: (f, ms = 20000) => new Promise((ok, no) => { const t0 = performance.now(); const g = () => { const v = f(); if (v) return ok(v); if (performance.now() - t0 > ms) return no(new Error('tempo')); requestAnimationFrame(g); }; g(); }),
  giu: (el, x, y, tipo = 'pointerdown') => el.dispatchEvent(new PointerEvent(tipo, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, buttons: tipo === 'pointerup' ? 0 : 1, pointerType: 'touch' })),
  fine: () => new Promise(ok => { const g = () => document.querySelector('#avv-ri') ? ok(document.querySelector('.avv-ris b').textContent.trim()) : requestAnimationFrame(g); g(); }),
  async puzzle() {
    const pan = await this.attendi(() => document.querySelector('.puz-p')); await this.attendi(() => !document.querySelector('.acc-cd.on'));
    const C = [...document.querySelectorAll('.puz-c')];
    for (let i = 0; i < 9; i++) { const pos = pan.puzzle(); if (pos[i] === i) continue; const j = pos.indexOf(i); C[i].click(); await new Promise(r => setTimeout(r, 60)); C[j].click(); await new Promise(r => setTimeout(r, 60)); }
    return this.fine();
  },
  async brindisi() {
    const pan = await this.attendi(() => document.querySelector('.cin-p')); await this.attendi(() => pan.classList.contains('attesa'));
    this.giu(pan); await new Promise(r => setTimeout(r, 300));   // una falsa partenza
    for (let k = 0; k < 5; k++) { await this.attendi(() => pan.cin()); await new Promise(r => setTimeout(r, 180)); this.giu(pan); await this.attendi(() => !pan.cin()); }
    return this.fine();
  },
  async domande(sel) {
    const w = await this.attendi(() => document.querySelector(sel)); await this.attendi(() => !document.querySelector('.acc-cd.on') || document.querySelector('.can-via'));
    const via = document.querySelector('.can-via button'); if (via) via.click();
    const n = +document.querySelector('.chi-q').textContent.split('/')[1];
    for (let k = 0; k < n; k++) { const g = await this.attendi(() => w.giusta && w.giusta()); const b = [...document.querySelectorAll('.chi-o')].find(x => k === 1 ? x.dataset.n !== g : x.dataset.n === g); b.click(); await this.attendi(() => !w.giusta() || w.giusta() !== g, 5000).catch(() => {}); await new Promise(r => setTimeout(r, 1150)); }
    return this.fine();
  },
  async slitta() {
    const pan = await this.attendi(() => document.querySelector('.sli-p')); await this.attendi(() => !document.querySelector('.acc-cd.on'));
    let ult = 0;
    await new Promise(ok => { const g = () => {
      if (document.querySelector('.acc-cd.on') || !pan.isConnected) return ok();
      const s = pan.slitta(), occ = c => s.cose.some(o => o.t !== 'regalo' && o.c === c && o.y - 96 > -10 && o.y - 96 < 150);
      if (occ(s.corsia) && performance.now() - ult > 250) { const L = [s.corsia - 1, s.corsia + 1].filter(c => c >= 0 && c <= 2 && !occ(c)); if (L.length) { const r = pan.getBoundingClientRect(); this.giu(pan, L[0] < s.corsia ? r.left + 20 : r.right - 20, r.top + 50); ult = performance.now(); } }
      requestAnimationFrame(g); }; g(); });
    return this.fine();
  },
  async regali() {
    const pan = await this.attendi(() => document.querySelector('.sac-p')); await this.attendi(() => !document.querySelector('.acc-cd.on'));
    const r0 = pan.getBoundingClientRect(); this.giu(pan, r0.left + r0.width / 2, r0.bottom - 20);
    await new Promise(ok => { const g = () => {
      if (document.querySelector('.acc-cd.on') || !pan.isConnected) return ok();
      const s = pan.regali(), b = s.cose.filter(o => o.t !== 'carbone' && o.y < 352).sort((p, q) => q.y - p.y)[0];
      if (b) { const r = pan.getBoundingClientRect(); this.giu(pan, r.left + b.x * r.width / 300, r.bottom - 20, 'pointermove'); }
      requestAnimationFrame(g); }; g(); });
    return this.fine();
  },
  async campanelle(fino = 5) {
    const pan = await this.attendi(() => document.querySelector('.cmp-p')); const B = [...document.querySelectorAll('.cmp-c')];
    for (;;) {
      await this.attendi(() => pan.simon().turno || document.querySelector('#avv-ri'), 30000); if (document.querySelector('#avv-ri')) break;
      const s = pan.simon();
      if (s.seq.length > fino) { this.giu(B[(s.seq[0] + 1) % 4]); break; }
      for (const i of s.seq) { this.giu(B[i]); await new Promise(r => setTimeout(r, 90)); }
    }
    return this.fine();
  },
  async spumante(mete = [60, 101, 80]) {
    const pan = await this.attendi(() => document.querySelector('.spu-p'));
    for (const m of mete) {
      await this.attendi(() => pan.pressione().pronto, 10000); this.giu(pan);
      await this.attendi(() => pan.pressione().p >= m || !pan.pressione().carica, 15000); this.giu(pan, 0, 0, 'pointerup'); await new Promise(r => setTimeout(r, 300));
    }
    return this.fine();
  }
};
