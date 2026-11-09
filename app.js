/* Paulinho Coach – gestão de alunos (dados salvos no navegador via localStorage) */
(() => {
  'use strict';

  const STORAGE_KEY = 'paulinhoCoach.alunos.v1';
  const DIAS_URGENCIA = 7;       // progressão considerada atrasada após X dias
  const FREQ_BOA = 3;            // treinos nos últimos 7 dias para considerar "boa frequência"
  const MESES_TROCA_SERIE = 3;

  /* ---------- Datas ---------- */
  const pad = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hoje = () => toISO(new Date());
  const parse = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const diasEntre = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const fmt = iso => parse(iso).toLocaleDateString('pt-BR');
  const addMeses = (iso, n) => {
    const d = parse(iso); const dia = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dia, ultimo));
    return toISO(d);
  };
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

  /* ---------- Dados ---------- */
  let alunos = [];
  const localSave = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(alunos)); return true; }
    catch { toast('Não foi possível salvar os dados neste navegador.'); return false; }
  };
  const load = () => {
    try { alunos = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { alunos = []; }
  };
  // salva no aparelho na hora e envia para a nuvem (Netlify) em seguida
  const save = () => { localSave(); setMeta({ dirty: true }); agendarEnvio(); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Regras de negócio ---------- */
  function frequenciaSemana(a) {
    const h = hoje();
    return (a.treinos || []).filter(d => { const x = diasEntre(d, h); return x >= 0 && x <= 6; }).length;
  }

  function statusProgressao(a) {
    const dias = diasEntre(a.ultimaProgressao, hoje());
    const freq = frequenciaSemana(a);
    const boa = freq >= FREQ_BOA;
    const regular = freq === 2;
    let cor, rotulo;
    if (boa && dias > DIAS_URGENCIA)            { cor = 'danger';    rotulo = 'Progredir carga já'; }
    else if ((boa && dias >= DIAS_URGENCIA - 2) || (regular && dias > DIAS_URGENCIA))
                                                { cor = 'warning';   rotulo = 'Atenção à progressão'; }
    else if (freq <= 1 && dias > DIAS_URGENCIA) { cor = 'secondary'; rotulo = 'Pouca frequência'; }
    else                                        { cor = 'success';   rotulo = 'Progressão em dia'; }
    return { cor, rotulo, dias, freq };
  }

  function statusSerie(a) {
    const vence = addMeses(a.ultimaTrocaSerie, MESES_TROCA_SERIE);
    const faltam = diasEntre(hoje(), vence);
    return { vence, faltam, vencida: faltam <= 0, proxima: faltam > 0 && faltam <= 14 };
  }

  const peso = { danger: 0, warning: 1, success: 2, secondary: 3 };

  /* ---------- Render ---------- */
  const $ = id => document.getElementById(id);

  function render() {
    const termo = $('busca').value.trim().toLowerCase();
    const lista = alunos
      .map(a => ({ a, st: statusProgressao(a) }))
      .filter(({ a }) => a.nome.toLowerCase().includes(termo))
      .sort((x, y) => peso[x.st.cor] - peso[y.st.cor] || x.a.nome.localeCompare(y.a.nome, 'pt-BR'));

    $('vazio').classList.toggle('d-none', alunos.length > 0);
    $('listaAlunos').innerHTML = lista.map(({ a, st }) => cardHTML(a, st)).join('');
    renderAlertas();
  }

  function cardHTML(a, st) {
    const se = statusSerie(a);
    const feitoHoje = (a.treinos || []).includes(hoje());
    const txtProg = st.dias === 0 ? 'hoje' : `há ${plural(st.dias, 'dia', 'dias')}`;
    let txtSerie, iconeSerie = '';
    if (se.vencida) { txtSerie = `Trocar série! (venceu há ${plural(Math.abs(se.faltam), 'dia', 'dias')})`; iconeSerie = 'bi-exclamation-octagon-fill'; }
    else if (se.proxima) { txtSerie = `Série vence em ${plural(se.faltam, 'dia', 'dias')}`; iconeSerie = 'bi-bell-fill'; }
    else { txtSerie = `Próxima troca: ${fmt(se.vence)}`; iconeSerie = 'bi-calendar-check'; }

    const textoCor = st.cor === 'warning' ? 'text-dark' : '';
    return `
    <div class="col-12 col-md-6 col-lg-4">
      <div class="card student-card text-bg-${st.cor} h-100 shadow-sm ${textoCor}" data-id="${a.id}">
        <div class="card-body d-flex flex-column">
          <div class="d-flex justify-content-between align-items-start mb-1">
            <div>
              <div class="status">${st.rotulo}</div>
              <h5 class="card-title mb-0">${esc(a.nome)}</h5>
            </div>
            <button class="btn btn-light btn-sm btn-menu" data-menu="${a.id}" aria-label="Opções"><i class="bi bi-three-dots-vertical"></i></button>
          </div>
          <div class="info mb-2">${esc(a.sexo)}, ${a.idade} anos · ${esc(a.objetivo)}</div>
          <div class="info mb-3">
            <div><i class="bi bi-graph-up-arrow"></i>Última progressão: <strong>${fmt(a.ultimaProgressao)}</strong> (${txtProg})</div>
            <div><i class="bi bi-calendar-week"></i>Frequência: <strong>${plural(st.freq, 'treino', 'treinos')}</strong> nos últimos 7 dias</div>
            <div class="${se.vencida ? 'fw-bold' : ''}"><i class="bi ${iconeSerie}"></i>${txtSerie}</div>
          </div>
          <div class="mt-auto d-grid gap-2">
            <button class="btn btn-light btn-sm fw-semibold" data-acao-card="progredir" data-id="${a.id}"><i class="bi bi-arrow-up-circle-fill"></i> Registrar progressão de carga</button>
            <div class="d-flex gap-2">
              <button class="btn btn-light btn-sm flex-fill" data-acao-card="treino" data-id="${a.id}">
                <i class="bi ${feitoHoje ? 'bi-check-circle-fill text-success' : 'bi-plus-circle'}"></i> ${feitoHoje ? 'Treinou hoje' : 'Registrar treino'}
              </button>
              <button class="btn btn-light btn-sm flex-fill ${se.vencida ? 'border-dark border-2' : ''}" data-acao-card="serie" data-id="${a.id}">
                <i class="bi bi-arrow-repeat"></i> Trocou a série
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderAlertas() {
    const vencidas = alunos.filter(a => statusSerie(a).vencida);
    $('alertasSerie').innerHTML = vencidas.length ? `
      <div class="alert alert-danger d-flex gap-3 align-items-start shadow-sm" role="alert">
        <i class="bi bi-bell-fill fs-4"></i>
        <div>
          <strong>Hora de trocar a série (a cada ${MESES_TROCA_SERIE} meses):</strong>
          <ul class="mb-0 mt-1 ps-3">
            ${vencidas.map(a => `<li>${esc(a.nome)} <span class="text-muted">— venceu há ${plural(Math.abs(statusSerie(a).faltam), 'dia', 'dias')}</span></li>`).join('')}
          </ul>
        </div>
      </div>` : '';
  }

  /* ---------- Ações ---------- */
  const find = id => alunos.find(a => a.id === id);

  function progredir(id) {
    const a = find(id); if (!a) return;
    a.ultimaProgressao = hoje(); save(); render();
    toast(`Progressão de carga de ${a.nome} registrada.`);
  }
  function toggleTreino(id) {
    const a = find(id); if (!a) return;
    a.treinos = a.treinos || [];
    const h = hoje(), i = a.treinos.indexOf(h);
    if (i >= 0) a.treinos.splice(i, 1); else a.treinos.push(h);
    save(); render();
  }
  function trocouSerie(id) {
    const a = find(id); if (!a) return;
    a.ultimaTrocaSerie = hoje(); save(); render();
    toast(`Série de ${a.nome} atualizada. Próximo lembrete em ${MESES_TROCA_SERIE} meses.`);
  }
  function duplicar(id) {
    const a = find(id); if (!a) return;
    const copia = { ...a, id: uid(), nome: a.nome + ' (cópia)', treinos: [], criadoEm: hoje() };
    alunos.push(copia); save(); render();
    toast(`${a.nome} duplicado.`);
  }

  /* ---------- Modal aluno ---------- */
  const modalAluno = new bootstrap.Modal($('modalAluno'));
  const modalExcluir = new bootstrap.Modal($('modalExcluir'));
  const form = $('formAluno');
  let idExcluir = null;

  function abrirForm(id) {
    form.classList.remove('was-validated');
    form.reset();
    const a = id ? find(id) : null;
    $('modalAlunoTitulo').textContent = a ? 'Editar aluno' : 'Novo aluno';
    $('alunoId').value = a ? a.id : '';
    if (a) {
      $('nome').value = a.nome; $('idade').value = a.idade; $('sexo').value = a.sexo; $('objetivo').value = a.objetivo;
      $('dataProgressao').value = a.ultimaProgressao; $('dataSerie').value = a.ultimaTrocaSerie;
    } else {
      $('dataProgressao').value = hoje(); $('dataSerie').value = hoje();
    }
    modalAluno.show();
    $('nome').focus();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
    const id = $('alunoId').value;
    const dados = {
      nome: $('nome').value.trim(),
      idade: Number($('idade').value),
      sexo: $('sexo').value,
      objetivo: $('objetivo').value.trim(),
      ultimaProgressao: $('dataProgressao').value || hoje(),
      ultimaTrocaSerie: $('dataSerie').value || hoje()
    };
    if (id) Object.assign(find(id), dados);
    else alunos.push({ id: uid(), treinos: [], criadoEm: hoje(), ...dados });
    save(); render(); modalAluno.hide();
    toast(id ? 'Aluno atualizado.' : 'Aluno cadastrado.');
  });

  function pedirExclusao(id) {
    const a = find(id); if (!a) return;
    idExcluir = id; $('excluirNome').textContent = a.nome; modalExcluir.show();
  }
  $('btnConfirmaExcluir').addEventListener('click', () => {
    alunos = alunos.filter(a => a.id !== idExcluir);
    save(); render(); modalExcluir.hide(); toast('Aluno excluído.');
  });

  /* ---------- Menu de contexto (botão direito / segurar / ⋮) ---------- */
  const ctx = $('ctxMenu');
  let ctxId = null;

  function abrirMenu(id, x, y) {
    ctxId = id;
    ctx.classList.add('show');
    const w = ctx.offsetWidth, h = ctx.offsetHeight;
    ctx.style.left = Math.min(x, window.innerWidth - w - 8) + 'px';
    ctx.style.top = Math.min(y, window.innerHeight - h - 8) + 'px';
  }
  const fecharMenu = () => ctx.classList.remove('show');

  $('listaAlunos').addEventListener('contextmenu', e => {
    const card = e.target.closest('.student-card');
    if (!card) return;
    e.preventDefault();
    abrirMenu(card.dataset.id, e.clientX, e.clientY);
  });

  // pressionar e segurar no celular
  let pressTimer = null, pressPos = null;
  $('listaAlunos').addEventListener('touchstart', e => {
    const card = e.target.closest('.student-card');
    if (!card || e.target.closest('button')) return;
    const t = e.touches[0]; pressPos = { x: t.clientX, y: t.clientY };
    pressTimer = setTimeout(() => abrirMenu(card.dataset.id, pressPos.x, pressPos.y), 500);
  }, { passive: true });
  ['touchend', 'touchcancel', 'touchmove'].forEach(ev =>
    $('listaAlunos').addEventListener(ev, () => clearTimeout(pressTimer), { passive: true }));

  ctx.addEventListener('click', e => {
    const btn = e.target.closest('[data-acao]'); if (!btn) return;
    const id = ctxId; fecharMenu();
    if (btn.dataset.acao === 'editar') abrirForm(id);
    if (btn.dataset.acao === 'duplicar') duplicar(id);
    if (btn.dataset.acao === 'excluir') pedirExclusao(id);
  });
  document.addEventListener('click', e => { if (!ctx.contains(e.target) && !e.target.closest('[data-menu]')) fecharMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharMenu(); });
  window.addEventListener('scroll', fecharMenu, { passive: true });
  window.addEventListener('resize', fecharMenu);

  /* ---------- Cliques nos cards ---------- */
  $('listaAlunos').addEventListener('click', e => {
    const menuBtn = e.target.closest('[data-menu]');
    if (menuBtn) {
      e.stopPropagation();
      const r = menuBtn.getBoundingClientRect();
      abrirMenu(menuBtn.dataset.menu, r.left - 120, r.bottom + 4);
      return;
    }
    const b = e.target.closest('[data-acao-card]'); if (!b) return;
    const { acaoCard, id } = b.dataset;
    if (acaoCard === 'progredir') progredir(id);
    if (acaoCard === 'treino') toggleTreino(id);
    if (acaoCard === 'serie') trocouSerie(id);
  });

  /* ---------- Backup ---------- */
  $('btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(alunos, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `paulinho-coach-backup-${hoje()}.json`; a.click();
    URL.revokeObjectURL(a.href);
  });
  $('fileImport').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data) || !data.every(x => x && x.nome && x.ultimaProgressao && x.ultimaTrocaSerie)) throw 0;
      if (!confirm(`Importar ${data.length} alunos? Isso substitui a lista atual.`)) return;
      alunos = data; save(); render(); toast('Backup importado.');
    } catch { toast('Arquivo de backup inválido.'); }
    e.target.value = '';
  });

  /* ---------- Toast ---------- */
  const toastEl = $('toastMsg');
  function toast(msg) {
    $('toastTexto').textContent = msg;
    bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 2500 }).show();
  }

  /* ---------- Sincronização com o Netlify (Function + Blobs) ---------- */
  const API = '/api/alunos';
  const PIN_KEY = 'paulinhoCoach.pin';
  const META_KEY = 'paulinhoCoach.meta';
  let modo = 'checking';   // checking | cloud | syncing | local | needpin | offline
  let timerEnvio = null;

  const getPin = () => { try { return localStorage.getItem(PIN_KEY) || ''; } catch { return ''; } };
  const meta = () => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; } };
  const setMeta = m => { try { localStorage.setItem(META_KEY, JSON.stringify({ ...meta(), ...m })); } catch {} };

  const STATUS = {
    checking: ['bi-cloud', '', 'Verificando...'],
    syncing:  ['bi-cloud-arrow-up', '', 'Sincronizando...'],
    cloud:    ['bi-cloud-check-fill', 'text-success', 'Salvo na nuvem'],
    local:    ['bi-phone', 'text-warning', 'Só neste aparelho'],
    needpin:  ['bi-key-fill', 'text-warning', 'Digitar PIN'],
    offline:  ['bi-cloud-slash', 'text-danger', 'Sem conexão']
  };
  function setModo(m) {
    modo = m;
    const [icone, cor, texto] = STATUS[m];
    $('btnSync').innerHTML = `<i class="bi ${icone} ${cor}"></i><span class="d-none d-sm-inline ms-1">${texto}</span>`;
    $('btnSync').title = texto;
  }

  const api = (method, body) => fetch(API, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-pin': getPin() },
    body: body ? JSON.stringify({ alunos: body }) : undefined
  });

  const modalPin = new bootstrap.Modal($('modalPin'));
  function pedirPin(erro) {
    $('pinErro').classList.toggle('d-none', !erro);
    $('pinInput').value = '';
    modalPin.show();
    setTimeout(() => $('pinInput').focus(), 300);
  }
  $('formPin').addEventListener('submit', e => {
    e.preventDefault();
    try { localStorage.setItem(PIN_KEY, $('pinInput').value.trim()); } catch {}
    modalPin.hide();
    sincronizar();
  });

  function tratarResposta(res) {
    if (res.status === 404) { setModo('local'); return false; }
    if (res.status === 401) { try { localStorage.removeItem(PIN_KEY); } catch {} setModo('needpin'); pedirPin(true); return false; }
    if (!res.ok) { setModo('offline'); toast('Erro no servidor. Confira se PAULINHO_PIN está configurado no Netlify.'); return false; }
    return true;
  }

  async function enviar() {
    setModo('syncing');
    try {
      const res = await api('PUT', alunos);
      if (!tratarResposta(res)) return;
      setMeta({ dirty: false }); setModo('cloud');
    } catch { setModo('offline'); }
  }

  function agendarEnvio() {
    if (modo === 'local' || modo === 'checking') return;
    clearTimeout(timerEnvio);
    timerEnvio = setTimeout(enviar, 600);
  }

  async function sincronizar() {
    setModo('syncing');
    try {
      const res = await api('GET');
      if (!tratarResposta(res)) return;
      const remoto = (await res.json()).alunos;
      if (meta().dirty || remoto === null) {
        // alterações locais ainda não enviadas (ou nuvem vazia): a versão deste aparelho vale
        if (meta().dirty || alunos.length) { await enviar(); return; }
      } else {
        alunos = remoto; localSave(); render();
      }
      setModo('cloud');
    } catch { setModo('offline'); }
  }

  $('btnSync').addEventListener('click', () => {
    if (modo === 'needpin') pedirPin(false);
    else if (modo === 'local') toast('Publicação sem Function: os dados ficam salvos só neste aparelho.');
    else sincronizar();
  });
  window.addEventListener('online', () => { if (modo === 'offline') sincronizar(); });

  /* ---------- Init ---------- */
  $('btnNovo').addEventListener('click', () => abrirForm());
  $('btnNovoVazio').addEventListener('click', () => abrirForm());
  $('busca').addEventListener('input', render);
  load(); render();
  sincronizar();
  // re-renderiza se o app ficar aberto de um dia para o outro
  setInterval(render, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); if (modo === 'cloud' || modo === 'offline') sincronizar(); } });
})();
