/* Dashboard Salários 2024 — aplicação estática em JavaScript puro */
(function(){
  "use strict";

  const RAW = (window.RAIS_DATA || []).map((d, i) => ({
    id: i,
    ano: Number(d.ano),
    territorio_codigo: String(d.territorio_codigo || ""),
    territorio: String(d.territorio || d.territorio_codigo || "Brasil"),
    cnae_codigo: String(d.cnae_codigo || d.subclasse || "").padStart(7, "0"),
    secao: String(d.secao || ""),
    secao_desc: String(d.secao_desc || ""),
    divisao: String(d.divisao || "").padStart(2, "0"),
    divisao_desc: String(d.divisao_desc || ""),
    grupo: String(d.grupo || "").padStart(3, "0"),
    grupo_desc: String(d.grupo_desc || ""),
    classe: String(d.classe || "").padStart(5, "0"),
    classe_desc: String(d.classe_desc || ""),
    subclasse: String(d.subclasse || d.cnae_codigo || "").padStart(7, "0"),
    subclasse_desc: String(d.subclasse_desc || ""),
    salario: Number(d.remuneracao_media || 0),
    remuneracao_media: Number(d.remuneracao_media || 0),
    vinculos: Number(d.vinculos || 0),
    massa_salarial: Number(d.massa_salarial || 0)
  })).filter(d => d.salario > 0 && d.vinculos > 0);

  const LEVELS = {
    secao: { code:"secao", desc:"secao_desc", label:"Seção", short:"Seção" },
    divisao: { code:"divisao", desc:"divisao_desc", label:"Divisão", short:"Div." },
    grupo: { code:"grupo", desc:"grupo_desc", label:"Grupo", short:"Grupo" },
    classe: { code:"classe", desc:"classe_desc", label:"Classe", short:"Classe" },
    subclasse: { code:"subclasse", desc:"subclasse_desc", label:"Subclasse", short:"Subcl." }
  };
  const HIERARCHY = ["secao","divisao","grupo","classe","subclasse"];

  const PALETTE = ["#0b5cab","#2a9d8f","#7c3aed","#f97316","#14b8a6","#e11d48","#64748b","#a16207","#2563eb","#16a34a","#9333ea","#ea580c","#0891b2","#be123c","#475569","#4f46e5","#65a30d","#db2777","#0f766e","#b45309"];
  const RELATION_COLORS = { above:"#147a3d", near:"#b7791f", below:"#b42318", lt50:"#7f1d1d" };
  const CLASS_COLORS = {
    "Alta remuneração e alto emprego":"#147a3d",
    "Alta remuneração e baixo emprego":"#2a9d8f",
    "Baixa remuneração e alto emprego":"#b7791f",
    "Baixa remuneração e baixo emprego":"#b42318"
  };

  const state = {
    year: null,
    territory: null,
    level: "subclasse",
    secao: "all",
    divisao: "all",
    grupo: "all",
    classe: "all",
    subclasse: "all",
    salaryRange: "all",
    jobRange: "all",
    salaryQuartile: "all",
    jobQuartile: "all",
    jenksClass: "all",
    relation: "all",
    topN: 20,
    colorMode: "relation",
    treemapMetric: "massa_salarial",
    histMode: "salario",
    boxLevel: "secao",
    compositionMetric: "vinculos",
    breakMethod: "jenks",
    focusCode: null,
    tableSearch: "",
    classificationFilter: "all",
    weights: { salary: 35, jobs: 25, mass: 25, distance: 15 },
    tableSort: { key: "indice_priorizacao", dir: "desc" }
  };

  let cache = { grouped: [], filtered: [], reference: null, tableRows: [] };

  const $ = id => document.getElementById(id);
  const tooltip = $("tooltip");

  function init(){
    if (!RAW.length) {
      document.body.innerHTML = "<div class='empty-state'>A base não foi carregada. Verifique o arquivo data.js.</div>";
      return;
    }
    state.year = unique(RAW.map(d => d.ano)).sort((a,b)=>b-a)[0];
    state.territory = unique(RAW.map(d => d.territorio_codigo)).sort()[0];
    populateStaticSelectors();
    bindEvents();
    updateHierarchyOptions();
    updateDashboard();
    $("loading").classList.add("hidden");
  }

  function populateStaticSelectors(){
    fillSelect($("yearSelect"), unique(RAW.map(d => d.ano)).sort((a,b)=>b-a).map(y => ({value:String(y), label:String(y)})), String(state.year));
    const territories = unique(RAW.map(d => d.territorio_codigo)).sort().map(code => {
      const rec = RAW.find(d => d.territorio_codigo === code);
      return { value: code, label: rec ? rec.territorio : code };
    });
    fillSelect($("territorySelect"), territories, state.territory);
    $("territorySelect").disabled = territories.length <= 1;
    $("territoryHint").textContent = territories.length <= 1 ? "A base enviada contém apenas a referência nacional." : "Selecione a unidade territorial de referência.";
    $("levelSelect").value = state.level;
    $("topN").value = String(state.topN);
    updateWeightLabels();
  }

  function bindEvents(){
    $("yearSelect").addEventListener("change", e => {
      state.year = Number(e.target.value);
      resetHierarchy();
      updateHierarchyOptions();
      updateDashboard();
    });
    $("territorySelect").addEventListener("change", e => {
      state.territory = e.target.value;
      resetHierarchy();
      updateHierarchyOptions();
      updateDashboard();
    });
    $("levelSelect").addEventListener("change", e => { state.level = e.target.value; state.focusCode = null; updateDashboard(); });
    $("salaryIndicator").addEventListener("change", updateDashboard);

    HIERARCHY.forEach((lvl, idx) => {
      const el = $(lvl + "Select");
      el.addEventListener("change", e => {
        state[lvl] = e.target.value;
        HIERARCHY.slice(idx+1).forEach(lower => state[lower] = "all");
        state.focusCode = null;
        updateHierarchyOptions();
        updateDashboard();
      });
    });

    ["salaryRange","jobRange","salaryQuartile","jobQuartile","jenksClass","relationSelect"].forEach(id => {
      $(id).addEventListener("change", e => {
        const key = id === "relationSelect" ? "relation" : id;
        state[key] = e.target.value;
        state.focusCode = null;
        updateDashboard();
      });
    });
    $("topN").addEventListener("change", e => { state.topN = Number(e.target.value); updateDashboard(); });
    $("colorMode").addEventListener("change", e => { state.colorMode = e.target.value; updateDashboard(); });
    $("treemapMetric").addEventListener("change", e => { state.treemapMetric = e.target.value; renderTreemap(cache.filtered); });
    $("histMode").addEventListener("change", e => { state.histMode = e.target.value; renderHistogram(cache.filtered); });
    $("boxLevel").addEventListener("change", e => { state.boxLevel = e.target.value; renderBoxplot(); });
    $("compositionMetric").addEventListener("change", e => { state.compositionMetric = e.target.value; renderComposition(cache.filtered); });
    $("breakMethod").addEventListener("change", e => { state.breakMethod = e.target.value; renderBreaksScatter(cache.filtered); });

    $("resetFilters").addEventListener("click", () => {
      resetHierarchy();
      state.level = "subclasse";
      state.salaryRange = "all";
      state.jobRange = "all";
      state.salaryQuartile = "all";
      state.jobQuartile = "all";
      state.jenksClass = "all";
      state.relation = "all";
      state.focusCode = null;
      state.classificationFilter = "all";
      state.tableSearch = "";
      syncControls();
      updateHierarchyOptions();
      updateDashboard();
    });

    ["wSalary","wJobs","wMass","wDistance"].forEach(id => {
      $(id).addEventListener("input", () => {
        state.weights = {
          salary: Number($("wSalary").value),
          jobs: Number($("wJobs").value),
          mass: Number($("wMass").value),
          distance: Number($("wDistance").value)
        };
        updateWeightLabels();
        updatePriorityIndex(cache.filtered);
        renderPriorityRanking(cache.filtered);
        renderTable(cache.filtered);
      });
    });

    $("tableSearch").addEventListener("input", e => {
      state.tableSearch = e.target.value;
      renderTable(cache.filtered);
    });
    $("classificationFilter").addEventListener("change", e => {
      state.classificationFilter = e.target.value;
      renderTable(cache.filtered);
    });
    $("clearFocus").addEventListener("click", () => { state.focusCode = null; renderTable(cache.filtered); updateSelectionBadge(); });
    $("exportFiltered").addEventListener("click", () => exportRows(cache.tableRows.length ? cache.tableRows : cache.filtered, "tabela_salarios_rais_2024.csv"));
    $("downloadPriority").addEventListener("click", () => {
      const rows = [...cache.filtered].sort((a,b)=>b.indice_priorizacao-a.indice_priorizacao);
      exportRows(rows, "ranking_priorizacao_salarios_2024.csv");
    });

    document.querySelectorAll(".tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        $("tab-" + btn.dataset.tab).classList.add("active");
        setTimeout(() => renderAllCharts(), 30);
      });
    });

    window.addEventListener("resize", debounce(renderAllCharts, 150));
  }

  function syncControls(){
    $("levelSelect").value = state.level;
    $("salaryRange").value = state.salaryRange;
    $("jobRange").value = state.jobRange;
    $("salaryQuartile").value = state.salaryQuartile;
    $("jobQuartile").value = state.jobQuartile;
    $("jenksClass").value = state.jenksClass;
    $("relationSelect").value = state.relation;
    $("classificationFilter").value = state.classificationFilter;
    $("tableSearch").value = state.tableSearch;
  }

  function resetHierarchy(){
    HIERARCHY.forEach(lvl => state[lvl] = "all");
  }

  function updateHierarchyOptions(){
    HIERARCHY.forEach((lvl, idx) => {
      let rows = RAW.filter(d => d.ano === state.year && d.territorio_codigo === state.territory);
      HIERARCHY.slice(0, idx).forEach(parent => {
        if (state[parent] !== "all") rows = rows.filter(d => d[parent] === state[parent]);
      });
      const opts = buildOptions(rows, lvl);
      const value = opts.some(o => o.value === state[lvl]) ? state[lvl] : "all";
      state[lvl] = value;
      fillSelect($(lvl+"Select"), [{value:"all", label:"Todas"}].concat(opts), value);
    });
  }

  function buildOptions(rows, lvl){
    const meta = LEVELS[lvl];
    const map = new Map();
    rows.forEach(d => {
      const code = d[meta.code];
      if (!code) return;
      if (!map.has(code)) map.set(code, `${code} — ${d[meta.desc] || ""}`.trim());
    });
    return [...map.entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).map(([value,label]) => ({value,label}));
  }

  function updateDashboard(){
    const ref = computeReference();
    cache.reference = ref;
    const rawFiltered = filterRawByHierarchy();
    let grouped = aggregateByLevel(rawFiltered, state.level, ref);
    grouped = enrichRows(grouped, ref);
    cache.grouped = grouped;
    let filtered = applyAnalyticFilters(grouped);
    updatePriorityIndex(filtered);
    cache.filtered = filtered;

    populateClassificationFilter(grouped);
    updateCards(filtered, grouped, ref);
    updatePolicyReading(filtered, grouped, ref);
    updateSelectionBadge();
    renderAllCharts();
    renderTable(filtered);
  }

  function filterRawByHierarchy(){
    let rows = RAW.filter(d => d.ano === state.year && d.territorio_codigo === state.territory);
    HIERARCHY.forEach(lvl => {
      if (state[lvl] !== "all") rows = rows.filter(d => d[lvl] === state[lvl]);
    });
    return rows;
  }

  function computeReference(){
    let base = RAW.filter(d => d.ano === state.year);
    const brasil = base.filter(d => /BR|Brasil/i.test(d.territorio_codigo + " " + d.territorio));
    if (brasil.length) base = brasil;
    const vinc = sum(base, "vinculos");
    const massa = sum(base, "massa_salarial");
    return {
      salario: vinc ? massa / vinc : 0,
      vinculos: vinc,
      massa: massa,
      atividades: base.length
    };
  }

  function aggregateByLevel(rows, level, ref){
    const meta = LEVELS[level];
    const map = new Map();
    rows.forEach(d => {
      const key = d[meta.code] || "NA";
      if (!map.has(key)) {
        map.set(key, {
          key,
          codigo: key,
          descricao: d[meta.desc] || key,
          nivel: meta.label,
          secao: d.secao, secao_desc: d.secao_desc,
          divisao: d.divisao, divisao_desc: d.divisao_desc,
          grupo: d.grupo, grupo_desc: d.grupo_desc,
          classe: d.classe, classe_desc: d.classe_desc,
          subclasse: d.subclasse, subclasse_desc: d.subclasse_desc,
          n_subclasses: 0,
          vinculos: 0,
          massa_salarial: 0
        });
      }
      const g = map.get(key);
      g.vinculos += d.vinculos;
      g.massa_salarial += d.massa_salarial;
      g.n_subclasses += 1;
    });
    return [...map.values()].map(g => ({
      ...g,
      salario: g.vinculos ? g.massa_salarial / g.vinculos : 0,
      salario_referencia: ref.salario
    })).filter(d => d.vinculos > 0 && d.salario > 0);
  }

  function enrichRows(rows, ref){
    const totalV = sum(rows, "vinculos");
    const totalM = sum(rows, "massa_salarial");
    const salaries = rows.map(d => d.salario);
    const jobs = rows.map(d => d.vinculos);
    const qSalary = [quantile(salaries,.25), quantile(salaries,.50), quantile(salaries,.75)];
    const qJobs = [quantile(jobs,.25), quantile(jobs,.50), quantile(jobs,.75)];
    const breaks = jenksBreaks(salaries, Math.min(5, Math.max(1, unique(salaries).length)));
    const salaryRank = rankMap(rows, "salario");
    const jobRank = rankMap(rows, "vinculos");
    const massRank = rankMap(rows, "massa_salarial");
    const highJobCut = qJobs[1] || 0;

    const enriched = rows.map(d => {
      const rel = ref.salario ? d.salario / ref.salario : 0;
      const difAbs = d.salario - ref.salario;
      const difPct = ref.salario ? ((d.salario / ref.salario) - 1) * 100 : 0;
      const shareV = totalV ? d.vinculos / totalV : 0;
      const shareM = totalM ? d.massa_salarial / totalM : 0;
      const sq = quartileClass(d.salario, qSalary);
      const jq = quartileClass(d.vinculos, qJobs);
      const jc = jenksClass(d.salario, breaks);
      const relation = rel >= 1.05 ? "above" : rel >= .95 ? "near" : rel < .5 ? "lt50" : "below";
      const highSalary = d.salario >= ref.salario;
      const highJobs = d.vinculos >= highJobCut;
      const classificacao = highSalary && highJobs
        ? "Alta remuneração e alto emprego"
        : highSalary && !highJobs
          ? "Alta remuneração e baixo emprego"
          : !highSalary && highJobs
            ? "Baixa remuneração e alto emprego"
            : "Baixa remuneração e baixo emprego";
      const faixaRelativa = rel >= 1 ? "Acima da média nacional" : rel >= .75 ? "Entre 75% e 100% da média" : rel >= .5 ? "Entre 50% e 75% da média" : "Abaixo de 50% da média";
      return {
        ...d,
        salario_relativo: rel,
        diferenca_abs: difAbs,
        diferenca_pct: difPct,
        share_vinculos: shareV,
        share_massa_salarial: shareM,
        quartil_salarial: sq,
        quartil_vinculos: jq,
        jenks_classe: jc,
        relation,
        classificacao,
        faixa_relativa: faixaRelativa,
        ranking_salarial: salaryRank.get(d.key) || null,
        ranking_vinculos: jobRank.get(d.key) || null,
        ranking_massa_salarial: massRank.get(d.key) || null,
        indice_priorizacao: 0
      };
    });
    updatePriorityIndex(enriched);
    return enriched;
  }

  function updatePriorityIndex(rows){
    const weights = state.weights;
    const totalW = Math.max(1, weights.salary + weights.jobs + weights.mass + weights.distance);
    const stdSalary = minmax(rows.map(d => d.salario_relativo));
    const stdJobs = minmax(rows.map(d => d.vinculos));
    const stdMass = minmax(rows.map(d => d.massa_salarial));
    const stdDistance = minmax(rows.map(d => Math.max(0, d.diferenca_pct)));
    rows.forEach((d, i) => {
      d.indice_priorizacao =
        (weights.salary/totalW) * stdSalary[i] +
        (weights.jobs/totalW) * stdJobs[i] +
        (weights.mass/totalW) * stdMass[i] +
        (weights.distance/totalW) * stdDistance[i];
    });
    rows.sort((a,b)=>b.indice_priorizacao-a.indice_priorizacao);
  }

  function applyAnalyticFilters(rows){
    return rows.filter(d => {
      if (!salaryRangeOk(d.salario, state.salaryRange)) return false;
      if (!jobRangeOk(d.vinculos, state.jobRange)) return false;
      if (state.salaryQuartile !== "all" && d.quartil_salarial !== Number(state.salaryQuartile)) return false;
      if (state.jobQuartile !== "all" && d.quartil_vinculos !== Number(state.jobQuartile)) return false;
      if (state.jenksClass !== "all" && d.jenks_classe !== Number(state.jenksClass)) return false;
      if (!relationOk(d, state.relation)) return false;
      return true;
    });
  }

  function relationOk(d, filter){
    if (filter === "all") return true;
    if (filter === "above") return d.salario_relativo >= 1;
    if (filter === "near") return d.salario_relativo >= .95 && d.salario_relativo <= 1.05;
    if (filter === "below") return d.salario_relativo < 1;
    if (filter === "lt50") return d.salario_relativo < .5;
    if (filter === "50-75") return d.salario_relativo >= .5 && d.salario_relativo < .75;
    if (filter === "75-100") return d.salario_relativo >= .75 && d.salario_relativo < 1;
    return true;
  }

  function salaryRangeOk(v, f){
    if (f === "all") return true;
    if (f === "lt1500") return v < 1500;
    if (f === "1500-2500") return v >= 1500 && v < 2500;
    if (f === "2500-5000") return v >= 2500 && v < 5000;
    if (f === "5000-10000") return v >= 5000 && v < 10000;
    if (f === "gt10000") return v >= 10000;
    return true;
  }
  function jobRangeOk(v, f){
    if (f === "all") return true;
    if (f === "lt100") return v < 100;
    if (f === "100-1000") return v >= 100 && v < 1000;
    if (f === "1000-10000") return v >= 1000 && v < 10000;
    if (f === "10000-100000") return v >= 10000 && v < 100000;
    if (f === "gt100000") return v >= 100000;
    return true;
  }

  function updateCards(filtered, grouped, ref){
    const totalAllV = sum(grouped, "vinculos");
    const totalAllM = sum(grouped, "massa_salarial");
    const totalV = sum(filtered, "vinculos");
    const totalM = sum(filtered, "massa_salarial");
    const salarioSel = totalV ? totalM / totalV : 0;
    const above = filtered.filter(d => d.salario >= ref.salario).length;
    const below = filtered.filter(d => d.salario < ref.salario).length;
    const diffAbs = salarioSel - ref.salario;
    const diffPct = ref.salario ? (salarioSel / ref.salario - 1) * 100 : 0;
    const kpis = [
      ["Remuneração da seleção", fmtCurrency(salarioSel), "Indicador ponderado por vínculos"],
      ["Média nacional ref.", fmtCurrency(ref.salario), "Remuneração ponderada no Brasil"],
      ["Diferença absoluta", signedCurrency(diffAbs), `${signed(diffPct,1)}% frente à referência`],
      ["Vínculos formais", fmtNumber(totalV), `${fmtPercent(totalAllV ? totalV/totalAllV : 0)} do universo filtrável`],
      ["Massa salarial estimada", fmtCurrencyCompact(totalM), `${fmtPercent(totalAllM ? totalM/totalAllM : 0)} da massa no universo`],
      ["Atividades analisadas", fmtNumber(filtered.length), `${fmtPercent(grouped.length ? filtered.length/grouped.length : 0)} dos grupos disponíveis`],
      ["Acima da média", fmtPercent(filtered.length ? above/filtered.length : 0), `${above} atividades acima da ref.`],
      ["Abaixo da média", fmtPercent(filtered.length ? below/filtered.length : 0), `${below} atividades abaixo da ref.`],
      ["Maior remuneração", filtered.length ? fmtCurrency(max(filtered, "salario")) : "—", "Maior valor no conjunto filtrado"],
      ["Índice de priorização", filtered.length ? fmtNumber(max(filtered, "indice_priorizacao")*100,1) : "—", "Escala 0–100; exploratória"]
    ];
    $("kpiGrid").innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-label">${escapeHtml(k[0])}</div>
        <div class="kpi-value">${k[1]}</div>
        <div class="kpi-foot">${escapeHtml(k[2])}</div>
      </div>
    `).join("");
  }

  function updatePolicyReading(filtered, grouped, ref){
    if (!filtered.length) {
      $("policyReading").innerHTML = "<p>Nenhuma atividade atende aos filtros atuais. Reduza as restrições para recompor a leitura.</p>";
      return;
    }
    const totalV = sum(filtered, "vinculos");
    const totalM = sum(filtered, "massa_salarial");
    const salarioSel = totalV ? totalM / totalV : 0;
    const rel = ref.salario ? salarioSel / ref.salario : 0;
    const medianJobs = quantile(grouped.map(d => d.vinculos), .5);
    const highEmploymentShare = filtered.filter(d => d.vinculos >= medianJobs).length / filtered.length;
    const topClass = mode(filtered.map(d => d.classificacao));
    const highHigh = filtered.filter(d => d.classificacao === "Alta remuneração e alto emprego").length;
    const highLow = filtered.filter(d => d.classificacao === "Alta remuneração e baixo emprego").length;
    const lowHigh = filtered.filter(d => d.classificacao === "Baixa remuneração e alto emprego").length;
    const messages = [];

    if (rel >= 1.05 && highEmploymentShare >= .4) {
      messages.push("As atividades selecionadas apresentam remuneração superior à média nacional e participação ocupacional relativamente relevante no conjunto analisado, sugerindo potencial de geração de renda com escala formal.");
    } else if (rel >= 1.05) {
      messages.push("A seleção apresenta remuneração elevada, mas a escala ocupacional é mais restrita para parte relevante das atividades. Esse perfil pode indicar atividades sofisticadas ou intensivas em qualificação, mas com menor alcance direto sobre o emprego formal.");
    } else if (rel < .95 && highEmploymentShare >= .4) {
      messages.push("Apesar do volume de vínculos, a remuneração ponderada está abaixo da referência nacional. Esse perfil indica relevância social e ocupacional, mas menor capacidade média de geração de renda por trabalhador.");
    } else {
      messages.push("A seleção apresenta remuneração próxima ou inferior à média nacional e composição heterogênea de vínculos, exigindo leitura combinada entre salário, escala, massa salarial e aderência territorial.");
    }

    if (highHigh > 0) {
      messages.push(`${highHigh} atividade(s) estão no quadrante de alta remuneração e alto emprego, grupo que pode ser candidato a análise mais detalhada para políticas de desenvolvimento produtivo.`);
    }
    if (highLow > lowHigh && highLow > 0) {
      messages.push("Há presença relevante de atividades de alta remuneração e baixo emprego, possivelmente importantes para diversificação e sofisticação, mas com efeitos ocupacionais diretos mais limitados.");
    }
    if (lowHigh > 0) {
      messages.push("Atividades de baixa remuneração e alto emprego devem ser avaliadas com cautela: podem ser relevantes para inclusão produtiva, mas não necessariamente elevam a renda média sem ganhos de produtividade.");
    }
    messages.push("Salário, vínculos e massa salarial são indicadores relevantes, mas insuficientes para definir incentivo público. A decisão deve considerar encadeamentos produtivos, inovação, sustentabilidade, concentração de mercado, externalidades, aderência territorial e objetivos estratégicos da política.");

    $("policyReading").innerHTML = messages.map(m => `<p>${escapeHtml(m)}</p>`).join("");
  }

  function updateSelectionBadge(){
    if (!state.focusCode) {
      $("selectionBadge").textContent = "Sem foco específico";
      return;
    }
    const row = cache.filtered.find(d => d.key === state.focusCode) || cache.grouped.find(d => d.key === state.focusCode);
    $("selectionBadge").textContent = row ? `Foco: ${row.codigo}` : "Foco aplicado";
  }

  function populateClassificationFilter(grouped){
    const el = $("classificationFilter");
    const selected = state.classificationFilter;
    const opts = unique(grouped.map(d => d.classificacao)).sort().map(v => ({value:v,label:v}));
    fillSelect(el, [{value:"all",label:"Todas as classificações"}].concat(opts), opts.some(o=>o.value===selected) ? selected : "all");
  }

  function renderAllCharts(){
    renderRanking("salaryRanking", cache.filtered, "salario", "Remuneração", fmtCurrency);
    renderRanking("massRanking", cache.filtered, "massa_salarial", "Massa salarial", fmtCurrencyCompact);
    renderRanking("jobRanking", cache.filtered, "vinculos", "Vínculos", fmtNumber);
    renderScatter(cache.filtered);
    renderTreemap(cache.filtered);
    renderDispersionStats(cache.filtered);
    renderHistogram(cache.filtered);
    renderBoxplot();
    renderComposition(cache.filtered);
    renderPriorityMatrix(cache.filtered);
    renderBreaksScatter(cache.filtered);
    renderPriorityRanking(cache.filtered);
  }

  function renderRanking(containerId, rows, metric, label, formatter){
    const container = $(containerId);
    if (!container || !isVisible(container)) return;
    clear(container);
    const sorted = [...rows].sort((a,b)=>b[metric]-a[metric]);
    const n = Math.min(sorted.length, state.topN || 20);
    const data = sorted.slice(0,n);
    if (!data.length) return empty(container);
    const baseH = Math.max(container.clientHeight || 420, data.length * 28 + 70);
    container.style.overflowY = data.length > 20 ? "auto" : "hidden";
    const w = container.clientWidth || 800, h = baseH;
    const margin = {top:24,right:90,bottom:34,left:220};
    const maxVal = Math.max(...data.map(d => d[metric])) || 1;
    const svg = svgEl("svg", {viewBox:`0 0 ${w} ${h}`, height:h});
    const plotW = w - margin.left - margin.right;
    const rowH = (h - margin.top - margin.bottom) / data.length;
    addGridX(svg, margin, plotW, h, maxVal, formatter, metric === "massa_salarial");

    data.forEach((d,i) => {
      const y = margin.top + i*rowH + 4;
      const barH = Math.max(8, rowH - 8);
      const bw = plotW * (d[metric] / maxVal);
      const color = colorFor(d, state.colorMode);
      const labelText = `${d.codigo} — ${truncate(d.descricao, 58)}`;
      svg.appendChild(svgEl("text", {x:10,y:y+barH*0.72,class:"bar-label"}, labelText));
      const rect = svgEl("rect", {x:margin.left,y:y,width:bw,height:barH,rx:6,fill:color,"data-code":d.key});
      rect.addEventListener("mousemove", e => showTooltip(e, tooltipHtml(d)));
      rect.addEventListener("mouseleave", hideTooltip);
      rect.addEventListener("click", () => setFocus(d.key));
      svg.appendChild(rect);
      svg.appendChild(svgEl("text", {x:margin.left+bw+6,y:y+barH*0.72,class:"bar-value"}, formatter(d[metric])));
    });
    svg.appendChild(svgEl("text", {x:margin.left,y:h-8,class:"chart-title-small"}, `${label} • ${data.length} de ${rows.length} atividades`));
    container.appendChild(svg);
  }

  function addGridX(svg, margin, plotW, h, maxVal, formatter, compact){
    const ticks = 4;
    for (let i=0;i<=ticks;i++){
      const v = maxVal * i / ticks;
      const x = margin.left + plotW * i / ticks;
      svg.appendChild(svgEl("line", {x1:x,y1:margin.top-6,x2:x,y2:h-margin.bottom+4,class:"grid-line"}));
      if (i>0) svg.appendChild(svgEl("text", {x:x,y:h-12,"text-anchor":"middle",class:"tick-text"}, compact ? fmtCurrencyCompact(v) : formatter(v)));
    }
  }

  function renderScatter(rows){
    const container = $("scatterChart");
    if (!container || !isVisible(container)) return;
    clear(container);
    if (!rows.length) return empty(container);
    const w = container.clientWidth || 800, h = container.clientHeight || 520;
    const margin = {top:24,right:30,bottom:56,left:70};
    const svg = svgEl("svg", {viewBox:`0 0 ${w} ${h}`});
    const xVals = rows.map(d => Math.log10(d.vinculos + 1));
    const yVals = rows.map(d => d.salario);
    const xD = extent(xVals), yD = padExtent(extent(yVals), .08);
    const sx = v => scale(v, xD[0], xD[1], margin.left, w-margin.right);
    const sy = v => scale(v, yD[0], yD[1], h-margin.bottom, margin.top);
    drawAxes(svg, w, h, margin, xD, yD, v=>fmtNumber(Math.pow(10,v)-1), fmtCurrency);
    const refY = sy(cache.reference.salario);
    svg.appendChild(svgEl("line", {x1:margin.left,y1:refY,x2:w-margin.right,y2:refY,class:"ref-line"}));
    svg.appendChild(svgEl("text", {x:w-margin.right-4,y:refY-6,"text-anchor":"end",class:"tick-text"}, "média nacional"));
    const medY = sy(quantile(yVals,.5));
    svg.appendChild(svgEl("line", {x1:margin.left,y1:medY,x2:w-margin.right,y2:medY,stroke:"#94a3b8","stroke-dasharray":"2 5"}));
    svg.appendChild(svgEl("text", {x:w-margin.right-4,y:medY+14,"text-anchor":"end",class:"tick-text"}, "mediana da distribuição"));
    rows.forEach(d => {
      const r = Math.max(4, Math.min(18, Math.sqrt(d.massa_salarial / max(rows,"massa_salarial")) * 18));
      const c = svgEl("circle", {cx:sx(Math.log10(d.vinculos+1)), cy:sy(d.salario), r, fill:colorFor(d,state.colorMode), class:"point"});
      c.addEventListener("mousemove", e => showTooltip(e, tooltipHtml(d)));
      c.addEventListener("mouseleave", hideTooltip);
      c.addEventListener("click", () => setFocus(d.key));
      svg.appendChild(c);
    });
    svg.appendChild(svgEl("text", {x:(w+margin.left-margin.right)/2,y:h-15,"text-anchor":"middle",class:"chart-title-small"}, "Vínculos formais em escala logarítmica"));
    svg.appendChild(svgEl("text", {x:18,y:(h-margin.bottom+margin.top)/2,transform:`rotate(-90 18 ${(h-margin.bottom+margin.top)/2})`,"text-anchor":"middle",class:"chart-title-small"}, "Remuneração média nominal mensal"));
    container.appendChild(svg);
  }

  function renderPriorityMatrix(rows){
    const container = $("priorityMatrix");
    if (!container || !isVisible(container)) return;
    clear(container);
    if (!rows.length) return empty(container);
    const w = container.clientWidth || 800, h = container.clientHeight || 520;
    const margin = {top:34,right:30,bottom:56,left:70};
    const svg = svgEl("svg", {viewBox:`0 0 ${w} ${h}`});
    const xVals = rows.map(d => d.share_vinculos);
    const yVals = rows.map(d => d.salario_relativo);
    const xD = [0, Math.max(...xVals)*1.08 || .01], yD = padExtent([Math.min(...yVals, .25), Math.max(...yVals, 1.25)], .08);
    const sx = v => scale(v, xD[0], xD[1], margin.left, w-margin.right);
    const sy = v => scale(v, yD[0], yD[1], h-margin.bottom, margin.top);
    drawAxes(svg, w, h, margin, xD, yD, fmtPercent, v=>fmtNumber(v,2));
    const xCut = quantile(xVals,.5), yCut = 1;
    svg.appendChild(svgEl("line", {x1:sx(xCut), y1:margin.top, x2:sx(xCut), y2:h-margin.bottom, class:"ref-line"}));
    svg.appendChild(svgEl("line", {x1:margin.left, y1:sy(yCut), x2:w-margin.right, y2:sy(yCut), class:"ref-line"}));
    addQuadrantLabel(svg, sx(xCut)+(w-margin.right-sx(xCut))/2, margin.top+18, "Alta remuneração / alto emprego");
    addQuadrantLabel(svg, margin.left+(sx(xCut)-margin.left)/2, margin.top+18, "Alta remuneração / baixo emprego");
    addQuadrantLabel(svg, sx(xCut)+(w-margin.right-sx(xCut))/2, h-margin.bottom-8, "Baixa remuneração / alto emprego");
    addQuadrantLabel(svg, margin.left+(sx(xCut)-margin.left)/2, h-margin.bottom-8, "Baixa remuneração / baixo emprego");
    rows.forEach(d => {
      const r = Math.max(4, Math.min(17, Math.sqrt(d.massa_salarial / max(rows,"massa_salarial")) * 17));
      const c = svgEl("circle", {cx:sx(d.share_vinculos), cy:sy(d.salario_relativo), r, fill:colorFor(d,state.colorMode), class:"point"});
      c.addEventListener("mousemove", e => showTooltip(e, tooltipHtml(d)));
      c.addEventListener("mouseleave", hideTooltip);
      c.addEventListener("click", () => setFocus(d.key));
      svg.appendChild(c);
    });
    svg.appendChild(svgEl("text", {x:(w+margin.left-margin.right)/2,y:h-15,"text-anchor":"middle",class:"chart-title-small"}, "Participação nos vínculos"));
    svg.appendChild(svgEl("text", {x:18,y:(h-margin.bottom+margin.top)/2,transform:`rotate(-90 18 ${(h-margin.bottom+margin.top)/2})`,"text-anchor":"middle",class:"chart-title-small"}, "Salário relativo à média nacional"));
    container.appendChild(svg);
  }

  function renderBreaksScatter(rows){
    const container = $("breaksScatter");
    if (!container || !isVisible(container)) return;
    clear(container);
    if (!rows.length) return empty(container);
    const w = container.clientWidth || 800, h = container.clientHeight || 520;
    const margin = {top:24,right:30,bottom:56,left:70};
    const svg = svgEl("svg", {viewBox:`0 0 ${w} ${h}`});
    const xVals = rows.map(d => Math.log10(d.vinculos + 1));
    const yVals = rows.map(d => d.salario_relativo);
    const xD = extent(xVals), yD = padExtent(extent(yVals), .08);
    const sx = v => scale(v, xD[0], xD[1], margin.left, w-margin.right);
    const sy = v => scale(v, yD[0], yD[1], h-margin.bottom, margin.top);
    drawAxes(svg, w, h, margin, xD, yD, v=>fmtNumber(Math.pow(10,v)-1), v=>fmtNumber(v,2));
    const method = state.breakMethod;
    const vals = rows.map(d => d.salario);
    let breaks = [];
    if (method === "jenks") breaks = jenksBreaks(vals, Math.min(5, unique(vals).length));
    rows.forEach(d => {
      let cls = d.jenks_classe;
      if (method === "quartile") cls = d.quartil_salarial;
      if (method === "decile") cls = Math.max(1, Math.min(10, Math.ceil(percentRank(vals, d.salario) * 10)));
      const color = PALETTE[(cls-1) % PALETTE.length];
      const c = svgEl("circle", {cx:sx(Math.log10(d.vinculos+1)), cy:sy(d.salario_relativo), r:7, fill:color, class:"point"});
      c.addEventListener("mousemove", e => showTooltip(e, tooltipHtml(d) + `<br><strong>Classe:</strong> ${cls}`));
      c.addEventListener("mouseleave", hideTooltip);
      c.addEventListener("click", () => setFocus(d.key));
      svg.appendChild(c);
    });
    const yRef = sy(1);
    svg.appendChild(svgEl("line", {x1:margin.left,y1:yRef,x2:w-margin.right,y2:yRef,class:"ref-line"}));
    svg.appendChild(svgEl("text", {x:w-margin.right-4,y:yRef-6,"text-anchor":"end",class:"tick-text"}, "salário relativo = 1"));
    svg.appendChild(svgEl("text", {x:(w+margin.left-margin.right)/2,y:h-15,"text-anchor":"middle",class:"chart-title-small"}, `Método: ${method === "jenks" ? "Quebras naturais de Jenks" : method === "quartile" ? "Quartis" : "Decis"}`));
    container.appendChild(svg);
  }

  function addQuadrantLabel(svg, x, y, txt){
    svg.appendChild(svgEl("text", {x,y,"text-anchor":"middle",class:"tick-text",fill:"#334155"}, txt));
  }

  function renderTreemap(rows){
    const container = $("treemapChart");
    if (!container || !isVisible(container)) return;
    clear(container);
    if (!rows.length) return empty(container);
    const metric = state.treemapMetric;
    const w = container.clientWidth || 1000, h = container.clientHeight || 520;
    const svg = svgEl("svg", {viewBox:`0 0 ${w} ${h}`});
    let data = [...rows].sort((a,b)=>b[metric]-a[metric]);
    if (data.length > 70) {
      const kept = data.slice(0,69);
      const rest = data.slice(69);
      kept.push({
        key:"demais", codigo:"Demais", descricao:"Demais atividades", salario_relativo: weightedAverage(rest, "salario", "vinculos") / cache.reference.salario,
        massa_salarial: sum(rest,"massa_salarial"), vinculos: sum(rest,"vinculos"), classificacao:"Demais", relation:"near", secao:""
      });
      data = kept;
    }
    const cells = sliceDice(data, 0, 0, w, h, metric, 0);
    cells.forEach(cell => {
      const d = cell.item;
      const rect = svgEl("rect", {x:cell.x,y:cell.y,width:Math.max(0,cell.w),height:Math.max(0,cell.h),fill:colorScaleRelative(d.salario_relativo),class:"treemap-cell"});
      rect.addEventListener("mousemove", e => showTooltip(e, tooltipHtml(d)));
      rect.addEventListener("mouseleave", hideTooltip);
      rect.addEventListener("click", () => { if (d.key !== "demais") setFocus(d.key); });
      svg.appendChild(rect);
      if (cell.w > 90 && cell.h > 38) {
        svg.appendChild(svgEl("text", {x:cell.x+6,y:cell.y+16,class:"treemap-label"}, truncate(`${d.codigo}`, 15)));
        svg.appendChild(svgEl("text", {x:cell.x+6,y:cell.y+32,class:"tick-text"}, truncate(d.descricao, Math.floor(cell.w/7))));
      }
    });
    container.appendChild(svg);
  }

  function renderHistogram(rows){
    const container = $("histogramChart");
    if (!container || !isVisible(container)) return;
    clear(container);
    if (!rows.length) return empty(container);
    const values = state.histMode === "relativo" ? rows.map(d => d.salario_relativo) : rows.map(d => d.salario);
    const w = container.clientWidth || 800, h = container.clientHeight || 420;
    const margin = {top:24,right:24,bottom:50,left:56};
    const svg = svgEl("svg", {viewBox:`0 0 ${w} ${h}`});
    const bins = histogram(values, 18);
    const maxCount = Math.max(...bins.map(b => b.count), 1);
    const xD = [bins[0].x0, bins[bins.length-1].x1];
    const sx = v => scale(v, xD[0], xD[1], margin.left, w-margin.right);
    const sy = v => scale(v, 0, maxCount, h-margin.bottom, margin.top);
    drawAxes(svg, w, h, margin, xD, [0,maxCount], state.histMode === "relativo" ? (v=>fmtNumber(v,2)) : fmtCurrency, fmtNumber);
    bins.forEach(b => {
      const x = sx(b.x0) + 1, bw = Math.max(1, sx(b.x1)-sx(b.x0)-2);
      const y = sy(b.count), bh = h-margin.bottom-y;
      svg.appendChild(svgEl("rect", {x,y,width:bw,height:bh,rx:4,fill:"#0b5cab",opacity:.82}));
    });
    svg.appendChild(svgEl("text", {x:(w+margin.left-margin.right)/2,y:h-12,"text-anchor":"middle",class:"chart-title-small"}, state.histMode === "relativo" ? "Salário relativo" : "Remuneração mensal"));
    container.appendChild(svg);
  }

  function renderBoxplot(){
    const container = $("boxplotChart");
    if (!container || !isVisible(container)) return;
    clear(container);
    const raw = filterRawByHierarchy();
    if (!raw.length) return empty(container);
    const level = state.boxLevel;
    const meta = LEVELS[level];
    const groups = new Map();
    raw.forEach(d => {
      const key = d[meta.code];
      if (!groups.has(key)) groups.set(key, {key, label:`${key} — ${d[meta.desc]}`, vinculos:0, values:[]});
      groups.get(key).values.push(d.salario);
      groups.get(key).vinculos += d.vinculos;
    });
    let data = [...groups.values()].filter(g => g.values.length >= 2).sort((a,b)=>b.vinculos-a.vinculos).slice(0,14);
    if (!data.length) return empty(container, "Não há grupos com observações suficientes para boxplot.");
    data.forEach(g => {
      const vals = g.values.sort((a,b)=>a-b);
      const q1 = quantile(vals,.25), q2=quantile(vals,.5), q3=quantile(vals,.75), iqr=q3-q1;
      const lowFence = q1 - 1.5*iqr, highFence = q3 + 1.5*iqr;
      const inside = vals.filter(v => v >= lowFence && v <= highFence);
      g.q1=q1; g.q2=q2; g.q3=q3; g.low=inside[0]; g.high=inside[inside.length-1]; g.outliers=vals.filter(v => v<lowFence || v>highFence);
    });
    const allVals = data.flatMap(g => [g.low,g.high].concat(g.outliers)).filter(Number.isFinite);
    const w = container.clientWidth || 800, h = container.clientHeight || 520;
    const margin = {top:24,right:24,bottom:120,left:70};
    const svg = svgEl("svg", {viewBox:`0 0 ${w} ${h}`});
    const yD = padExtent(extent(allVals), .08);
    const sy = v => scale(v, yD[0], yD[1], h-margin.bottom, margin.top);
    const xStep = (w-margin.left-margin.right)/data.length;
    drawYGrid(svg, w, h, margin, yD, fmtCurrency);
    data.forEach((g,i) => {
      const cx = margin.left + xStep*(i+.5), boxW = Math.min(34, xStep*.55);
      const color = PALETTE[i%PALETTE.length];
      svg.appendChild(svgEl("line", {x1:cx,y1:sy(g.low),x2:cx,y2:sy(g.high),stroke:"#334155","stroke-width":1.3}));
      svg.appendChild(svgEl("line", {x1:cx-boxW/2,y1:sy(g.low),x2:cx+boxW/2,y2:sy(g.low),stroke:"#334155","stroke-width":1.3}));
      svg.appendChild(svgEl("line", {x1:cx-boxW/2,y1:sy(g.high),x2:cx+boxW/2,y2:sy(g.high),stroke:"#334155","stroke-width":1.3}));
      svg.appendChild(svgEl("rect", {x:cx-boxW/2,y:sy(g.q3),width:boxW,height:Math.max(1,sy(g.q1)-sy(g.q3)),fill:color,opacity:.75,stroke:"#1f2937"}));
      svg.appendChild(svgEl("line", {x1:cx-boxW/2,y1:sy(g.q2),x2:cx+boxW/2,y2:sy(g.q2),stroke:"#0f172a","stroke-width":2}));
      g.outliers.slice(0,30).forEach(v => svg.appendChild(svgEl("circle", {cx,cy:sy(v),r:2.5,fill:"#b42318",opacity:.75})));
      const label = truncate(g.label, 26);
      svg.appendChild(svgEl("text", {x:cx,y:h-105,transform:`rotate(-55 ${cx} ${h-105})`,"text-anchor":"end",class:"tick-text"}, label));
    });
    svg.appendChild(svgEl("text", {x:18,y:(h-margin.bottom+margin.top)/2,transform:`rotate(-90 18 ${(h-margin.bottom+margin.top)/2})`,"text-anchor":"middle",class:"chart-title-small"}, "Remuneração mensal"));
    container.appendChild(svg);
  }

  function renderComposition(rows){
    const container = $("compositionChart");
    if (!container || !isVisible(container)) return;
    clear(container);
    if (!rows.length) return empty(container);
    const metric = state.compositionMetric;
    const groups = groupSum(rows, "secao", metric, "secao_desc").sort((a,b)=>b.value-a.value);
    const total = sum(groups, "value") || 1;
    const w = container.clientWidth || 1000, h = container.clientHeight || 420;
    const svg = svgEl("svg", {viewBox:`0 0 ${w} ${h}`});
    const margin = {top:40,right:30,bottom:60,left:30};
    let x = margin.left;
    const y = 70, barH = 52, plotW = w-margin.left-margin.right;
    groups.forEach((g,i) => {
      const bw = plotW * g.value / total;
      const rect = svgEl("rect", {x,y,width:bw,height:barH,fill:PALETTE[i%PALETTE.length]});
      rect.addEventListener("mousemove", e => showTooltip(e, `<strong>${escapeHtml(g.key)} — ${escapeHtml(g.label)}</strong><br>${metric === "vinculos" ? "Vínculos" : "Massa"}: ${metric === "vinculos" ? fmtNumber(g.value) : fmtCurrencyCompact(g.value)}<br>Participação: ${fmtPercent(g.value/total)}`));
      rect.addEventListener("mouseleave", hideTooltip);
      svg.appendChild(rect);
      if (bw > 42) svg.appendChild(svgEl("text", {x:x+bw/2,y:y+31,"text-anchor":"middle",fill:"#fff","font-size":11,"font-weight":800}, `${g.key}`));
      x += bw;
    });
    let ly = 150;
    groups.slice(0,16).forEach((g,i) => {
      const col = i < 8 ? 0 : 1;
      const row = i % 8;
      const lx = margin.left + col * ((w - margin.left - margin.right)/2);
      ly = 150 + row*26;
      svg.appendChild(svgEl("rect", {x:lx,y:ly-10,width:11,height:11,fill:PALETTE[i%PALETTE.length]}));
      svg.appendChild(svgEl("text", {x:lx+18,y:ly,class:"tick-text"}, `${g.key} — ${truncate(g.label, 54)} (${fmtPercent(g.value/total)})`));
    });
    svg.appendChild(svgEl("text", {x:margin.left,y:30,class:"chart-title-small"}, `Composição 100% por seção CNAE • métrica: ${metric === "vinculos" ? "vínculos" : "massa salarial"}`));
    container.appendChild(svg);
  }

  function renderPriorityRanking(rows){
    const container = $("priorityRanking");
    if (!container || !isVisible(container)) return;
    renderRanking("priorityRanking", rows, "indice_priorizacao", "Índice de priorização", v => fmtNumber(v*100,1));
  }

  function renderDispersionStats(rows){
    const container = $("dispersionStats");
    if (!container) return;
    if (!rows.length) { container.innerHTML = "<div class='empty-state'>Sem dados para os filtros atuais.</div>"; return; }
    const vals = rows.map(d => d.salario).sort((a,b)=>a-b);
    const mean = average(vals);
    const med = quantile(vals,.5);
    const sd = std(vals);
    const q1 = quantile(vals,.25), q3 = quantile(vals,.75), iqr = q3-q1;
    const p10 = quantile(vals,.10), p90 = quantile(vals,.90);
    const lowFence = q1-1.5*iqr, highFence = q3+1.5*iqr;
    const outliers = vals.filter(v => v<lowFence || v>highFence).length;
    const skew = skewness(vals);
    const stats = [
      ["Média", fmtCurrency(mean)],
      ["Mediana", fmtCurrency(med)],
      ["Desvio-padrão", fmtCurrency(sd)],
      ["Coef. variação", fmtPercent(mean ? sd/mean : 0)],
      ["Mínimo", fmtCurrency(vals[0])],
      ["Máximo", fmtCurrency(vals[vals.length-1])],
      ["Quartil 1", fmtCurrency(q1)],
      ["Quartil 2", fmtCurrency(med)],
      ["Quartil 3", fmtCurrency(q3)],
      ["Intervalo interquartil", fmtCurrency(iqr)],
      ["Percentil 10", fmtCurrency(p10)],
      ["Percentil 90", fmtCurrency(p90)],
      ["Assimetria", fmtNumber(skew,2)],
      ["Outliers", fmtNumber(outliers)],
      ["Maior salário", fmtCurrency(vals[vals.length-1])],
      ["Menor salário", fmtCurrency(vals[0])]
    ];
    container.innerHTML = stats.map(s => `
      <div class="stat-item">
        <div class="stat-label">${escapeHtml(s[0])}</div>
        <div class="stat-value">${s[1]}</div>
      </div>
    `).join("");
  }

  const COLUMNS = [
    {key:"codigo", label:"Código CNAE"},
    {key:"descricao", label:"Descrição"},
    {key:"nivel", label:"Nível"},
    {key:"secao", label:"Seção"},
    {key:"divisao", label:"Divisão"},
    {key:"grupo", label:"Grupo"},
    {key:"classe", label:"Classe"},
    {key:"subclasse", label:"Subclasse"},
    {key:"vinculos", label:"Vínculos", numeric:true, fmt:fmtNumber},
    {key:"salario", label:"Remuneração", numeric:true, fmt:fmtCurrency},
    {key:"massa_salarial", label:"Massa salarial", numeric:true, fmt:fmtCurrencyCompact},
    {key:"salario_relativo", label:"Salário relativo", numeric:true, fmt:v=>fmtNumber(v,2)},
    {key:"diferenca_abs", label:"Dif. abs.", numeric:true, fmt:signedCurrency},
    {key:"diferenca_pct", label:"Dif. %", numeric:true, fmt:v=>signed(v,1)+"%"},
    {key:"share_vinculos", label:"Share vínculos", numeric:true, fmt:fmtPercent},
    {key:"share_massa_salarial", label:"Share massa", numeric:true, fmt:fmtPercent},
    {key:"quartil_salarial", label:"Q salário", numeric:true},
    {key:"quartil_vinculos", label:"Q vínculos", numeric:true},
    {key:"jenks_classe", label:"Jenks", numeric:true},
    {key:"ranking_salarial", label:"Rank salário", numeric:true},
    {key:"ranking_vinculos", label:"Rank vínculos", numeric:true},
    {key:"ranking_massa_salarial", label:"Rank massa", numeric:true},
    {key:"classificacao", label:"Classificação"},
    {key:"indice_priorizacao", label:"Índice", numeric:true, fmt:v=>fmtNumber(v*100,1)}
  ];

  function renderTable(rows){
    const table = $("analyticTable");
    if (!table) return;
    let data = [...rows];
    if (state.focusCode) data = data.filter(d => d.key === state.focusCode);
    if (state.classificationFilter !== "all") data = data.filter(d => d.classificacao === state.classificationFilter);
    const q = normalize(state.tableSearch);
    if (q) {
      data = data.filter(d => normalize(`${d.codigo} ${d.descricao} ${d.secao} ${d.secao_desc} ${d.divisao_desc} ${d.grupo_desc} ${d.classificacao}`).includes(q));
    }
    const sort = state.tableSort;
    data.sort((a,b) => compare(a[sort.key], b[sort.key], sort.dir));
    cache.tableRows = data;

    table.querySelector("thead").innerHTML = `<tr>${COLUMNS.map(c => `<th data-key="${c.key}">${escapeHtml(c.label)}${sort.key===c.key ? (sort.dir==="asc" ? " ▲" : " ▼") : ""}</th>`).join("")}</tr>`;
    table.querySelectorAll("th").forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (state.tableSort.key === key) state.tableSort.dir = state.tableSort.dir === "asc" ? "desc" : "asc";
        else state.tableSort = {key, dir: "desc"};
        renderTable(rows);
      });
    });
    const maxRowsDom = 300;
    const visibleData = data.slice(0, maxRowsDom);
    const body = visibleData.map(d => `<tr class="${state.focusCode===d.key ? "focused" : ""}">
      ${COLUMNS.map(c => {
        let val = c.fmt ? c.fmt(d[c.key]) : d[c.key];
        if (c.key === "classificacao") val = `<span class="tag ${tagClass(d)}">${escapeHtml(d[c.key])}</span>`;
        else val = escapeHtml(String(val ?? ""));
        return `<td class="${c.numeric ? "numeric" : ""}">${val}</td>`;
      }).join("")}
    </tr>`).join("");
    table.querySelector("tbody").innerHTML = body || `<tr><td colspan="${COLUMNS.length}">Nenhuma atividade encontrada.</td></tr>`;
    $("tableSummary").innerHTML = [
      `<span><strong>${fmtNumber(visibleData.length)}</strong> linhas exibidas de <strong>${fmtNumber(data.length)}</strong></span>`,
      data.length > maxRowsDom ? `<span>Use a busca, os filtros ou a exportação para acessar a tabela completa.</span>` : "",
      `<span><strong>${fmtNumber(rows.length)}</strong> atividades no conjunto filtrado</span>`,
      state.focusCode ? `<span><strong>Foco aplicado:</strong> ${escapeHtml(state.focusCode)}</span>` : ""
    ].join("");
  }

  function setFocus(code){
    state.focusCode = code;
    updateSelectionBadge();
    renderTable(cache.filtered);
    document.querySelector('.tab[data-tab="table"]').click();
  }

  function exportRows(rows, filename){
    const cols = COLUMNS.map(c => c.key);
    const header = COLUMNS.map(c => c.label);
    const csv = [header.join(";")].concat(rows.map(r => cols.map(k => csvEscape(rawExportValue(r[k]))).join(";"))).join("\n");
    const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function rawExportValue(v){
    if (typeof v === "number") return String(v).replace(".", ",");
    return v ?? "";
  }

  /* Utilidades de desenho */
  function svgEl(tag, attrs={}, text=null){
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    if (text !== null) el.textContent = text;
    return el;
  }
  function clear(container){ container.innerHTML = ""; }
  function empty(container, msg="Sem dados para os filtros atuais."){
    container.innerHTML = `<div class="empty-state">${escapeHtml(msg)}</div>`;
  }
  function isVisible(el){ return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }

  function drawAxes(svg, w, h, margin, xD, yD, xFmt, yFmt){
    drawYGrid(svg, w, h, margin, yD, yFmt);
    const ticks = 4;
    for (let i=0;i<=ticks;i++){
      const v = xD[0] + (xD[1]-xD[0])*i/ticks;
      const x = scale(v,xD[0],xD[1],margin.left,w-margin.right);
      svg.appendChild(svgEl("line", {x1:x,y1:h-margin.bottom,x2:x,y2:h-margin.bottom+5,stroke:"#94a3b8"}));
      svg.appendChild(svgEl("text", {x,y:h-margin.bottom+20,"text-anchor":"middle",class:"tick-text"}, xFmt(v)));
    }
    svg.appendChild(svgEl("line", {x1:margin.left,y1:h-margin.bottom,x2:w-margin.right,y2:h-margin.bottom,stroke:"#94a3b8"}));
  }
  function drawYGrid(svg, w, h, margin, yD, yFmt){
    const ticks = 5;
    for (let i=0;i<=ticks;i++){
      const v = yD[0] + (yD[1]-yD[0])*i/ticks;
      const y = scale(v,yD[0],yD[1],h-margin.bottom,margin.top);
      svg.appendChild(svgEl("line", {x1:margin.left,y1:y,x2:w-margin.right,y2:y,class:"grid-line"}));
      svg.appendChild(svgEl("text", {x:margin.left-8,y:y+4,"text-anchor":"end",class:"tick-text"}, yFmt(v)));
    }
    svg.appendChild(svgEl("line", {x1:margin.left,y1:margin.top,x2:margin.left,y2:h-margin.bottom,stroke:"#94a3b8"}));
  }

  function showTooltip(e, html){
    tooltip.innerHTML = html;
    tooltip.classList.remove("hidden");
    const pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    const rect = tooltip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - pad;
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  }
  function hideTooltip(){ tooltip.classList.add("hidden"); }

  function tooltipHtml(d){
    return `<strong>${escapeHtml(d.codigo)} — ${escapeHtml(d.descricao)}</strong><br>
      Nível: ${escapeHtml(d.nivel || "")}<br>
      Remuneração: ${fmtCurrency(d.salario)}<br>
      Salário relativo: ${fmtNumber(d.salario_relativo,2)}<br>
      Vínculos: ${fmtNumber(d.vinculos)}<br>
      Massa salarial: ${fmtCurrencyCompact(d.massa_salarial)}<br>
      Classificação: ${escapeHtml(d.classificacao || "")}`;
  }

  /* Utilidades estatísticas */
  function sum(arr, key){ return arr.reduce((s,d)=>s+(Number(d[key])||0),0); }
  function max(arr, key){ return arr.length ? Math.max(...arr.map(d => Number(d[key])||0)) : 0; }
  function average(arr){ return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0; }
  function std(arr){ if (arr.length < 2) return 0; const m=average(arr); return Math.sqrt(arr.reduce((s,v)=>s+(v-m)*(v-m),0)/(arr.length-1)); }
  function skewness(arr){ if (arr.length < 3) return 0; const m=average(arr), sdv=std(arr); if (!sdv) return 0; return arr.reduce((s,v)=>s+Math.pow((v-m)/sdv,3),0)/arr.length; }
  function quantile(arr, q){
    const a = arr.filter(Number.isFinite).slice().sort((x,y)=>x-y);
    if (!a.length) return 0;
    const pos = (a.length-1)*q, base = Math.floor(pos), rest = pos-base;
    return a[base+1] !== undefined ? a[base] + rest*(a[base+1]-a[base]) : a[base];
  }
  function extent(arr){
    const a = arr.filter(Number.isFinite);
    if (!a.length) return [0,1];
    let minV = Math.min(...a), maxV = Math.max(...a);
    if (minV === maxV) { minV -= 1; maxV += 1; }
    return [minV,maxV];
  }
  function padExtent(e, p){
    const span = e[1]-e[0] || 1;
    return [Math.max(0, e[0]-span*p), e[1]+span*p];
  }
  function scale(v, d0,d1,r0,r1){ return r0 + (v-d0)/(d1-d0 || 1)*(r1-r0); }
  function quartileClass(v, q){ return v <= q[0] ? 1 : v <= q[1] ? 2 : v <= q[2] ? 3 : 4; }
  function percentRank(vals, v){
    const a = vals.slice().sort((x,y)=>x-y);
    const idx = a.findIndex(x => x >= v);
    return idx < 0 ? 1 : (idx+1)/a.length;
  }
  function rankMap(rows, key){
    const sorted = [...rows].sort((a,b)=>b[key]-a[key]);
    const map = new Map();
    sorted.forEach((d,i)=>map.set(d.key, i+1));
    return map;
  }
  function minmax(vals){
    const e = extent(vals);
    return vals.map(v => (v-e[0])/(e[1]-e[0] || 1));
  }
  function histogram(values, n){
    const e = extent(values);
    const step = (e[1]-e[0]) / n || 1;
    const bins = Array.from({length:n}, (_,i)=>({x0:e[0]+i*step, x1:e[0]+(i+1)*step, count:0}));
    values.forEach(v => {
      let idx = Math.floor((v-e[0])/step);
      idx = Math.max(0, Math.min(n-1, idx));
      bins[idx].count++;
    });
    return bins;
  }

  function jenksBreaks(data, nClasses){
    const dataSorted = data.filter(Number.isFinite).slice().sort((a,b)=>a-b);
    const nData = dataSorted.length;
    if (!nData) return [];
    nClasses = Math.max(1, Math.min(nClasses, nData));
    if (nClasses === 1) return [dataSorted[0], dataSorted[nData-1]];
    const mat1 = Array.from({length:nData+1}, () => Array(nClasses+1).fill(0));
    const mat2 = Array.from({length:nData+1}, () => Array(nClasses+1).fill(0));
    for (let i=1;i<=nClasses;i++){
      mat1[0][i]=1; mat2[0][i]=0;
      for (let j=1;j<=nData;j++) mat2[j][i]=Infinity;
    }
    for (let l=2;l<=nData;l++){
      let s1=0,s2=0,w=0;
      for (let m=1;m<=l;m++){
        const i3 = l-m+1;
        const val = dataSorted[i3-1];
        s2 += val*val; s1 += val; w++;
        const variance = s2 - (s1*s1)/w;
        const i4 = i3-1;
        if (i4 !== 0) {
          for (let j=2;j<=nClasses;j++){
            if (mat2[l][j] >= variance + mat2[i4][j-1]) {
              mat1[l][j] = i3;
              mat2[l][j] = variance + mat2[i4][j-1];
            }
          }
        }
      }
      mat1[l][1]=1; mat2[l][1]=s2-(s1*s1)/w;
    }
    const breaks = Array(nClasses+1).fill(0);
    breaks[nClasses] = dataSorted[nData-1];
    breaks[0] = dataSorted[0];
    let k = nData;
    for (let j=nClasses;j>=2;j--){
      const id = mat1[k][j]-2;
      breaks[j-1] = dataSorted[Math.max(0,id)];
      k = mat1[k][j]-1;
    }
    return breaks;
  }
  function jenksClass(v, breaks){
    if (!breaks.length) return 1;
    for (let i=1;i<breaks.length;i++){
      if (v <= breaks[i]) return i;
    }
    return breaks.length-1;
  }

  function sliceDice(items, x, y, w, h, metric, depth){
    const total = items.reduce((s,d)=>s+(Number(d[metric])||0),0);
    if (!items.length || total <= 0 || w <= 0 || h <= 0) return [];
    if (items.length === 1) return [{item:items[0],x,y,w,h}];
    let acc = 0, half = total/2, idx = 0;
    for (; idx<items.length; idx++){ acc += Number(items[idx][metric])||0; if (acc >= half) break; }
    idx = Math.max(0, Math.min(items.length-2, idx));
    const left = items.slice(0,idx+1), right = items.slice(idx+1);
    const leftTotal = left.reduce((s,d)=>s+(Number(d[metric])||0),0);
    const ratio = leftTotal / total;
    if ((depth % 2 === 0 && w >= h) || h < 80) {
      const w1 = w * ratio;
      return sliceDice(left,x,y,w1,h,metric,depth+1).concat(sliceDice(right,x+w1,y,w-w1,h,metric,depth+1));
    } else {
      const h1 = h * ratio;
      return sliceDice(left,x,y,w,h1,metric,depth+1).concat(sliceDice(right,x,y+h1,w,h-h1,metric,depth+1));
    }
  }

  function groupSum(rows, codeKey, metric, descKey){
    const map = new Map();
    rows.forEach(d => {
      const key = d[codeKey] || "NA";
      if (!map.has(key)) map.set(key,{key,label:d[descKey]||key,value:0});
      map.get(key).value += d[metric] || 0;
    });
    return [...map.values()];
  }
  function weightedAverage(rows, valueKey, weightKey){
    const w = sum(rows, weightKey);
    return w ? rows.reduce((s,d)=>s+(d[valueKey]||0)*(d[weightKey]||0),0)/w : 0;
  }

  /* Utilidades de UI */
  function fillSelect(el, options, selected){
    el.innerHTML = options.map(o => `<option value="${escapeAttr(o.value)}">${escapeHtml(o.label)}</option>`).join("");
    el.value = selected;
  }
  function unique(arr){ return [...new Set(arr.filter(v => v !== null && v !== undefined && v !== ""))]; }
  function mode(arr){
    const m = new Map();
    arr.forEach(v => m.set(v,(m.get(v)||0)+1));
    return [...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || "";
  }
  function colorFor(d, mode){
    if (mode === "quartile") return PALETTE[(d.quartil_salarial-1)%PALETTE.length];
    if (mode === "classificacao") return CLASS_COLORS[d.classificacao] || "#64748b";
    if (mode === "secao") return PALETTE[Math.abs(hashCode(d.secao)) % PALETTE.length];
    if (mode === "jenks") return PALETTE[(d.jenks_classe-1)%PALETTE.length];
    return RELATION_COLORS[d.relation] || "#64748b";
  }
  function colorScaleRelative(rel){
    if (rel >= 1.25) return "#147a3d";
    if (rel >= 1.00) return "#2a9d8f";
    if (rel >= .75) return "#b7791f";
    if (rel >= .50) return "#f97316";
    return "#b42318";
  }
  function tagClass(d){
    if (d.classificacao === "Alta remuneração e alto emprego") return "good";
    if (d.classificacao === "Alta remuneração e baixo emprego") return "neutral";
    if (d.classificacao === "Baixa remuneração e alto emprego") return "warn";
    return "bad";
  }
  function updateWeightLabels(){
    $("wSalaryLabel").textContent = `${state.weights.salary}%`;
    $("wJobsLabel").textContent = `${state.weights.jobs}%`;
    $("wMassLabel").textContent = `${state.weights.mass}%`;
    $("wDistanceLabel").textContent = `${state.weights.distance}%`;
  }
  function compare(a,b,dir){
    const av = typeof a === "number" ? a : String(a ?? "").toLowerCase();
    const bv = typeof b === "number" ? b : String(b ?? "").toLowerCase();
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  }
  function debounce(fn, wait){
    let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
  }
  function hashCode(str){
    let h = 0; for (let i=0;i<String(str).length;i++) h = ((h<<5)-h) + String(str).charCodeAt(i) | 0; return h;
  }
  function normalize(s){ return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(); }
  function truncate(s, n){ s = String(s||""); return s.length > n ? s.slice(0,n-1) + "…" : s; }
  function escapeHtml(s){ return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
  function escapeAttr(s){ return escapeHtml(String(s ?? "")); }
  function csvEscape(s){ s = String(s ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }

  const NF0 = new Intl.NumberFormat("pt-BR", {maximumFractionDigits:0, minimumFractionDigits:0});
  const NF1 = new Intl.NumberFormat("pt-BR", {maximumFractionDigits:1, minimumFractionDigits:1});
  const NF2 = new Intl.NumberFormat("pt-BR", {maximumFractionDigits:2, minimumFractionDigits:2});
  const BRL0 = new Intl.NumberFormat("pt-BR", {style:"currency", currency:"BRL", maximumFractionDigits:0});
  const PCT1 = new Intl.NumberFormat("pt-BR", {style:"percent", minimumFractionDigits:1, maximumFractionDigits:1});
  function fmtNumber(v, digits=0){
    v = Number(v || 0);
    if (digits === 1) return NF1.format(v);
    if (digits === 2) return NF2.format(v);
    return NF0.format(v);
  }
  function fmtCurrency(v){ return BRL0.format(Number(v||0)); }
  function signedCurrency(v){ const s = v >= 0 ? "+" : ""; return s + fmtCurrency(v); }
  function fmtCurrencyCompact(v){
    v = Number(v||0);
    if (Math.abs(v) >= 1e9) return "R$ " + fmtNumber(v/1e9,1) + " bi";
    if (Math.abs(v) >= 1e6) return "R$ " + fmtNumber(v/1e6,1) + " mi";
    if (Math.abs(v) >= 1e3) return "R$ " + fmtNumber(v/1e3,1) + " mil";
    return fmtCurrency(v);
  }
  function fmtPercent(v){ return PCT1.format(Number(v||0)); }
  function signed(v,digits=1){ const s = v >= 0 ? "+" : ""; return s + fmtNumber(v,digits); }

  document.addEventListener("DOMContentLoaded", () => {
    try {
      init();
    } catch (err) {
      console.error("Erro ao inicializar o dashboard:", err);
      const loading = $("loading");
      if (loading) {
        loading.classList.remove("hidden");
        loading.innerHTML = `<div class="empty-state"><strong>Erro ao carregar o dashboard.</strong><br>Abra o console do navegador para ver detalhes. Mensagem: ${escapeHtml(err && err.message ? err.message : String(err))}</div>`;
      }
    }
  });
})();
