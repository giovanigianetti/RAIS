(() => {
  "use strict";

  const rawData = Array.isArray(window.RAIS_DATA) ? window.RAIS_DATA : [];

  const levels = [
    { key: "secao", code: "secao_cod", name: "secao_nome", label: "Seção" },
    { key: "divisao", code: "divisao_cod", name: "divisao_nome", label: "Divisão" },
    { key: "grupo", code: "grupo_cod", name: "grupo_nome", label: "Grupo" },
    { key: "classe", code: "classe_cod", name: "classe_nome", label: "Classe" },
    { key: "subclasse", code: "subclasse_cod", name: "subclasse_nome", label: "Subclasse" }
  ];
  const levelByKey = Object.fromEntries(levels.map((d) => [d.key, d]));
  const hierarchySelects = {
    secao: document.getElementById("filterSecao"),
    divisao: document.getElementById("filterDivisao"),
    grupo: document.getElementById("filterGrupo"),
    classe: document.getElementById("filterClasse"),
    subclasse: document.getElementById("filterSubclasse")
  };

  const els = {
    ano: document.getElementById("filterAno"),
    territorio: document.getElementById("filterTerritorio"),
    nivel: document.getElementById("filterNivel"),
    salario: document.getElementById("filterSalario"),
    vinculos: document.getElementById("filterVinculos"),
    criterio: document.getElementById("filterCriterio"),
    rankingMode: document.getElementById("filterRankingMode"),
    topN: document.getElementById("filterTopN"),
    cards: document.getElementById("cards"),
    policy: document.getElementById("policyReading"),
    stats: document.getElementById("statsBox"),
    table: document.getElementById("dataTable"),
    tableInfo: document.getElementById("tableInfo"),
    search: document.getElementById("tableSearch"),
    tooltip: document.getElementById("tooltip"),
    btnReset: document.getElementById("btnReset"),
    btnExportTable: document.getElementById("btnExportTable"),
    btnExportRanking: document.getElementById("btnExportRanking"),
    weights: {
      salario: document.getElementById("pesoSalario"),
      vinculos: document.getElementById("pesoVinculos"),
      massa: document.getElementById("pesoMassa"),
      distancia: document.getElementById("pesoDistancia")
    },
    weightOut: {
      salario: document.getElementById("outPesoSalario"),
      vinculos: document.getElementById("outPesoVinculos"),
      massa: document.getElementById("outPesoMassa"),
      distancia: document.getElementById("outPesoDistancia")
    }
  };

  let state = {
    tableSort: { key: "indice_priorizacao", dir: "desc" },
    tableRows: [],
    rankedRows: []
  };

  const palette = ["#1f6feb", "#2f9e73", "#9b5de5", "#f28444", "#0f766e", "#b54708", "#3b82f6", "#7c3aed", "#14b8a6", "#ef4444", "#64748b", "#a16207"];
  const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const fmtBRL1 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 1 });
  const fmtNum = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const fmtNum1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  const fmtPct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
  const fmtPp = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  function uniqueSorted(arr) {
    return [...new Set(arr.filter((d) => d !== undefined && d !== null && `${d}`.trim() !== ""))].sort((a, b) => `${a}`.localeCompare(`${b}`, "pt-BR", { numeric: true }));
  }

  function safeDiv(a, b) {
    return b && Number.isFinite(a) && Number.isFinite(b) ? a / b : 0;
  }

  function sum(arr, fn) {
    return arr.reduce((acc, d) => acc + (fn ? fn(d) : d), 0);
  }

  function mean(vals) {
    return vals.length ? sum(vals) / vals.length : 0;
  }

  function quantile(values, p) {
    const vals = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!vals.length) return 0;
    const i = (vals.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    if (lo === hi) return vals[lo];
    return vals[lo] + (vals[hi] - vals[lo]) * (i - lo);
  }

  function median(values) {
    return quantile(values, 0.5);
  }

  function std(values) {
    const vals = values.filter(Number.isFinite);
    if (vals.length <= 1) return 0;
    const m = mean(vals);
    return Math.sqrt(sum(vals.map((v) => (v - m) ** 2)) / (vals.length - 1));
  }

  function skewness(values) {
    const vals = values.filter(Number.isFinite);
    if (vals.length < 3) return 0;
    const m = mean(vals);
    const s = std(vals);
    if (!s) return 0;
    return sum(vals.map((v) => ((v - m) / s) ** 3)) / vals.length;
  }

  function normalizeRows(rows, key) {
    const vals = rows.map((d) => d[key]).filter(Number.isFinite);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return rows.map((d) => ({ id: d.id, value: max === min ? 0.5 : safeDiv(d[key] - min, max - min) }));
  }

  function jenksBreaks(values, nClasses) {
    const data = values.filter(Number.isFinite).sort((a, b) => a - b);
    const n = data.length;
    if (!n) return [];
    if (nClasses <= 1 || n <= nClasses) return uniqueSorted(data);
    const lower = Array.from({ length: n + 1 }, () => Array(nClasses + 1).fill(0));
    const variance = Array.from({ length: n + 1 }, () => Array(nClasses + 1).fill(0));
    for (let i = 1; i <= nClasses; i++) {
      lower[1][i] = 1;
      variance[1][i] = 0;
      for (let j = 2; j <= n; j++) variance[j][i] = Infinity;
    }
    for (let l = 2; l <= n; l++) {
      let s1 = 0, s2 = 0, w = 0;
      for (let m = 1; m <= l; m++) {
        const i3 = l - m + 1;
        const val = data[i3 - 1];
        s2 += val * val;
        s1 += val;
        w += 1;
        const v = s2 - (s1 * s1) / w;
        const i4 = i3 - 1;
        if (i4 !== 0) {
          for (let j = 2; j <= nClasses; j++) {
            if (variance[l][j] >= v + variance[i4][j - 1]) {
              lower[l][j] = i3;
              variance[l][j] = v + variance[i4][j - 1];
            }
          }
        }
      }
      lower[l][1] = 1;
      variance[l][1] = s2 - (s1 * s1) / w;
    }
    const breaks = Array(nClasses + 1).fill(0);
    breaks[nClasses] = data[n - 1];
    breaks[0] = data[0];
    let k = n;
    for (let j = nClasses; j >= 2; j--) {
      const id = lower[k][j] - 2;
      breaks[j - 1] = data[Math.max(0, id)];
      k = lower[k][j] - 1;
    }
    return breaks;
  }

  function classFromBreaks(value, breaks) {
    if (!breaks.length) return "Sem classe";
    for (let i = 1; i < breaks.length; i++) {
      if (value <= breaks[i]) return `Classe ${i}`;
    }
    return `Classe ${breaks.length - 1}`;
  }

  function ellipsize(text, n = 66) {
    const s = text || "";
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
  }

  function formatActivity(d) {
    return `${d.codigo} — ${d.nome}`;
  }

  function cssColor(i) {
    return palette[i % palette.length];
  }

  function showTooltip(html, event) {
    els.tooltip.innerHTML = html;
    els.tooltip.style.opacity = 1;
    els.tooltip.style.left = `${event.clientX + 12}px`;
    els.tooltip.style.top = `${event.clientY + 12}px`;
  }

  function hideTooltip() {
    els.tooltip.style.opacity = 0;
  }

  function initControls() {
    const anos = uniqueSorted(rawData.map((d) => d.ano));
    const territorios = uniqueSorted(rawData.map((d) => d.territorio || "Brasil"));
    fillSelect(els.ano, anos.map((d) => ({ value: d, label: d })), false);
    fillSelect(els.territorio, territorios.map((d) => ({ value: d, label: d })), false);

    [els.ano, els.territorio, els.nivel, els.salario, els.vinculos, els.criterio, els.rankingMode, els.topN, els.search].forEach((el) => {
      el.addEventListener("input", () => update());
      el.addEventListener("change", () => update());
    });
    Object.entries(hierarchySelects).forEach(([key, el]) => {
      el.addEventListener("change", () => updateHierarchyAndDashboard(key));
    });
    Object.entries(els.weights).forEach(([key, el]) => {
      el.addEventListener("input", () => {
        els.weightOut[key].textContent = el.value;
        update();
      });
    });
    els.btnReset.addEventListener("click", resetFilters);
    els.btnExportTable.addEventListener("click", () => exportCSV(state.tableRows, "tabela_analitica_salarios_2024.csv"));
    els.btnExportRanking.addEventListener("click", () => exportCSV(state.rankedRows, "ranking_priorizacao_salarios_2024.csv"));
    updateHierarchyOptions();
  }

  function fillSelect(select, opts, includeAll = true, allLabel = "Todos") {
    const current = select.value;
    select.innerHTML = "";
    if (includeAll) {
      const opt = document.createElement("option");
      opt.value = "all";
      opt.textContent = allLabel;
      select.appendChild(opt);
    }
    opts.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.value;
      opt.textContent = d.label;
      select.appendChild(opt);
    });
    if ([...select.options].some((o) => o.value === current)) select.value = current;
  }

  function resetFilters() {
    els.nivel.value = "subclasse";
    els.salario.value = "all";
    els.vinculos.value = "all";
    els.criterio.value = "quartis";
    els.rankingMode.value = "top";
    els.topN.value = "20";
    els.search.value = "";
    Object.values(hierarchySelects).forEach((el) => { el.value = "all"; });
    els.weights.salario.value = 35;
    els.weights.vinculos.value = 25;
    els.weights.massa.value = 25;
    els.weights.distancia.value = 15;
    Object.entries(els.weightOut).forEach(([key, out]) => { out.textContent = els.weights[key].value; });
    updateHierarchyOptions();
    update();
  }

  function getBaseRows(ignoreHierarchyBelow) {
    const ano = Number(els.ano.value);
    const territorio = els.territorio.value;
    let rows = rawData.filter((d) => Number(d.ano) === ano && (d.territorio || "Brasil") === territorio);
    for (const lvl of levels) {
      if (ignoreHierarchyBelow && levels.findIndex((x) => x.key === lvl.key) > levels.findIndex((x) => x.key === ignoreHierarchyBelow)) break;
      const val = hierarchySelects[lvl.key].value;
      if (val && val !== "all") rows = rows.filter((d) => `${d[lvl.code]}` === `${val}`);
    }
    return rows;
  }

  function updateHierarchyAndDashboard(changedKey) {
    const idx = levels.findIndex((d) => d.key === changedKey);
    levels.slice(idx + 1).forEach((lvl) => { hierarchySelects[lvl.key].value = "all"; });
    updateHierarchyOptions();
    update();
  }

  function updateHierarchyOptions() {
    const ano = Number(els.ano.value);
    const territorio = els.territorio.value;
    let rows = rawData.filter((d) => Number(d.ano) === ano && (d.territorio || "Brasil") === territorio);

    levels.forEach((lvl, idx) => {
      const prevRows = rows;
      const opts = uniqueSorted(prevRows.map((d) => d[lvl.code])).map((code) => {
        const found = prevRows.find((d) => `${d[lvl.code]}` === `${code}`);
        return { value: code, label: `${code} — ${found ? found[lvl.name] : ""}` };
      });
      fillSelect(hierarchySelects[lvl.key], opts, true, `Todas as ${lvl.label.toLowerCase()}s`);
      const val = hierarchySelects[lvl.key].value;
      if (val && val !== "all") rows = rows.filter((d) => `${d[lvl.code]}` === `${val}`);
    });
  }

  function aggregate(rows, levelKey) {
    const lvl = levelByKey[levelKey];
    const map = new Map();
    rows.forEach((r) => {
      const key = `${r[lvl.code] || "NC"}`;
      if (!map.has(key)) {
        const obj = {
          id: key,
          nivel: lvl.label,
          nivel_key: levelKey,
          codigo: key,
          nome: r[lvl.name] || "Não classificado",
          secao_cod: r.secao_cod,
          secao_nome: r.secao_nome,
          divisao_cod: r.divisao_cod,
          divisao_nome: r.divisao_nome,
          grupo_cod: r.grupo_cod,
          grupo_nome: r.grupo_nome,
          classe_cod: r.classe_cod,
          classe_nome: r.classe_nome,
          subclasse_cod: r.subclasse_cod,
          subclasse_nome: r.subclasse_nome,
          vinculos: 0,
          massa_salarial: 0,
          count_subclasses: 0
        };
        map.set(key, obj);
      }
      const obj = map.get(key);
      obj.vinculos += Number(r.vinculos) || 0;
      obj.massa_salarial += Number(r.massa_salarial) || 0;
      obj.count_subclasses += 1;
    });
    return [...map.values()].map((d) => ({
      ...d,
      salario: safeDiv(d.massa_salarial, d.vinculos)
    }));
  }

  function computeReference() {
    const ano = Number(els.ano.value);
    const territorio = els.territorio.value;
    const rows = rawData.filter((d) => Number(d.ano) === ano && (d.territorio || "Brasil") === territorio);
    const totalVinc = sum(rows, (d) => Number(d.vinculos) || 0);
    const totalMass = sum(rows, (d) => Number(d.massa_salarial) || 0);
    const refSalary = safeDiv(totalMass, totalVinc);
    return { rows, totalVinc, totalMass, refSalary, activityMedian: median(rows.map((d) => Number(d.salario) || 0)) };
  }

  function enrich(rows, ref) {
    const qSalary = [0.25, 0.5, 0.75].map((p) => quantile(rows.map((d) => d.salario), p));
    const qLinks = [0.25, 0.5, 0.75].map((p) => quantile(rows.map((d) => d.vinculos), p));
    const salaryVals = rows.map((d) => d.salario);
    const breaks = jenksBreaks(salaryVals, Math.min(5, Math.max(2, Math.min(rows.length, 5))));
    const deciles = Array.from({ length: 9 }, (_, i) => quantile(salaryVals, (i + 1) / 10));
    const medSalary = median(salaryVals);

    let out = rows.map((d) => {
      const salarioRel = safeDiv(d.salario, ref.refSalary);
      const diffAbs = d.salario - ref.refSalary;
      const diffPct = (salarioRel - 1) * 100;
      const shareLinks = safeDiv(d.vinculos, ref.totalVinc);
      const shareMass = safeDiv(d.massa_salarial, ref.totalMass);
      const quartilSal = d.salario <= qSalary[0] ? "Q1" : d.salario <= qSalary[1] ? "Q2" : d.salario <= qSalary[2] ? "Q3" : "Q4";
      const quartilLinks = d.vinculos <= qLinks[0] ? "Q1" : d.vinculos <= qLinks[1] ? "Q2" : d.vinculos <= qLinks[2] ? "Q3" : "Q4";
      const decil = 1 + deciles.filter((b) => d.salario > b).length;
      const jenks = classFromBreaks(d.salario, breaks);
      const band = salarioRel >= 1 ? "Acima da referência nacional" : salarioRel >= 0.75 ? "75% a 100% da referência" : salarioRel >= 0.5 ? "50% a 75% da referência" : "Abaixo de 50% da referência";
      const quadrant = salarioRel >= 1 && shareLinks >= qLinks[1] / ref.totalVinc ? "Alta remuneração e alto número de vínculos"
        : salarioRel >= 1 ? "Alta remuneração e baixo número de vínculos"
        : shareLinks >= qLinks[1] / ref.totalVinc ? "Baixa remuneração e alto número de vínculos"
        : "Baixa remuneração e baixo número de vínculos";
      return {
        ...d,
        salario_relativo: salarioRel,
        diferenca_abs: diffAbs,
        diferenca_pct: diffPct,
        share_vinculos: shareLinks,
        share_massa_salarial: shareMass,
        quartil_salarial: quartilSal,
        quartil_vinculos: quartilLinks,
        jenks_classe: jenks,
        decil_salarial: `D${decil}`,
        faixa_referencia: band,
        classificacao_analitica: quadrant,
        acima_media_nacional: salarioRel >= 1,
        acima_mediana_atividades: d.salario >= medSalary
      };
    });

    out = addRanks(out, "salario", "ranking_salarial");
    out = addRanks(out, "vinculos", "ranking_vinculos");
    out = addRanks(out, "massa_salarial", "ranking_massa_salarial");

    const normSalary = Object.fromEntries(normalizeRows(out, "salario_relativo").map((d) => [d.id, d.value]));
    const normLinks = Object.fromEntries(normalizeRows(out, "share_vinculos").map((d) => [d.id, d.value]));
    const normMass = Object.fromEntries(normalizeRows(out, "share_massa_salarial").map((d) => [d.id, d.value]));
    const normDiff = Object.fromEntries(normalizeRows(out, "diferenca_pct").map((d) => [d.id, d.value]));
    const w = getWeights();
    out = out.map((d) => {
      const score = safeDiv(
        w.salario * normSalary[d.id] + w.vinculos * normLinks[d.id] + w.massa * normMass[d.id] + w.distancia * normDiff[d.id],
        w.total
      ) * 100;
      return { ...d, indice_priorizacao: score };
    });
    out = addRanks(out, "indice_priorizacao", "ranking_priorizacao");
    return out;
  }

  function addRanks(rows, key, rankKey) {
    const sorted = rows.slice().sort((a, b) => (b[key] || 0) - (a[key] || 0));
    const ranks = new Map(sorted.map((d, i) => [d.id, i + 1]));
    return rows.map((d) => ({ ...d, [rankKey]: ranks.get(d.id) }));
  }

  function getWeights() {
    const salario = Number(els.weights.salario.value) || 0;
    const vinculos = Number(els.weights.vinculos.value) || 0;
    const massa = Number(els.weights.massa.value) || 0;
    const distancia = Number(els.weights.distancia.value) || 0;
    const total = salario + vinculos + massa + distancia || 1;
    return { salario, vinculos, massa, distancia, total };
  }

  function applyAnalyticalFilters(rows) {
    let out = rows.slice();
    const sal = els.salario.value;
    if (sal === "above_mean") out = out.filter((d) => d.salario_relativo >= 1);
    if (sal === "075_100") out = out.filter((d) => d.salario_relativo >= 0.75 && d.salario_relativo < 1);
    if (sal === "050_075") out = out.filter((d) => d.salario_relativo >= 0.5 && d.salario_relativo < 0.75);
    if (sal === "below_050") out = out.filter((d) => d.salario_relativo < 0.5);
    if (sal === "q4") out = out.filter((d) => d.quartil_salarial === "Q4");
    if (sal === "q1") out = out.filter((d) => d.quartil_salarial === "Q1");

    const vinc = els.vinculos.value;
    if (vinc === "q4") out = out.filter((d) => d.quartil_vinculos === "Q4");
    if (vinc === "upper_half") out = out.filter((d) => d.quartil_vinculos === "Q3" || d.quartil_vinculos === "Q4");
    if (vinc === "q1") out = out.filter((d) => d.quartil_vinculos === "Q1");
    return out;
  }

  function update() {
    updateHierarchyOptions();
    const ref = computeReference();
    const baseFiltered = getBaseRows();
    const levelKey = els.nivel.value;
    const aggregated = aggregate(baseFiltered, levelKey);
    const enriched = enrich(aggregated, ref);
    const analytical = applyAnalyticalFilters(enriched);
    renderAll(analytical, enriched, ref);
  }

  function renderAll(rows, beforeAnalytical, ref) {
    state.tableRows = sortRowsForTable(rows);
    state.rankedRows = rankRows(rows);
    renderCards(rows, ref);
    renderPolicy(rows, ref);
    renderStats(rows);
    renderRanking(rows);
    renderScatter(rows, ref);
    renderBoxplot(rows);
    renderHistogram(rows);
    renderTreemap(rows);
    renderStacked(rows, ref);
    renderMatrix(rows, ref);
    renderTable(state.tableRows);
  }

  function renderCards(rows, ref) {
    const selectedV = sum(rows, (d) => d.vinculos);
    const selectedM = sum(rows, (d) => d.massa_salarial);
    const selectedSalary = safeDiv(selectedM, selectedV);
    const above = rows.filter((d) => d.salario_relativo >= 1).length;
    const below = rows.length - above;
    const cards = [
      ["Salário ponderado da seleção", fmtBRL1.format(selectedSalary), "mediana nominal ponderada por vínculos"],
      ["Referência nacional", fmtBRL1.format(ref.refSalary), "base total disponível no ano"],
      ["Diferença absoluta", fmtBRL1.format(selectedSalary - ref.refSalary), "seleção versus referência"],
      ["Diferença percentual", `${fmtPp.format((safeDiv(selectedSalary, ref.refSalary) - 1) * 100)}%`, "seleção versus referência"],
      ["Vínculos formais", fmtNum.format(selectedV), `${fmtPct.format(safeDiv(selectedV, ref.totalVinc))} do total`],
      ["Massa salarial estimada", fmtBRL.format(selectedM), `${fmtPct.format(safeDiv(selectedM, ref.totalMass))} do total`],
      ["Atividades analisadas", fmtNum.format(rows.length), `${els.nivel.options[els.nivel.selectedIndex].text}`],
      ["Acima da referência", fmtPct.format(safeDiv(above, rows.length)), `${fmtNum.format(above)} atividades`],
      ["Abaixo da referência", fmtPct.format(safeDiv(below, rows.length)), `${fmtNum.format(below)} atividades`],
      ["Maior salário", rows.length ? fmtBRL1.format(Math.max(...rows.map((d) => d.salario))) : "—", "no nível filtrado"]
    ];
    els.cards.innerHTML = cards.map(([label, value, note]) => `
      <article class="card">
        <div class="label">${label}</div>
        <div class="value">${value}</div>
        <div class="note">${note}</div>
      </article>
    `).join("");
  }

  function renderPolicy(rows, ref) {
    if (!rows.length) {
      els.policy.innerHTML = "<p>Nenhuma atividade atende aos filtros selecionados. Reduza restrições para retomar a leitura analítica.</p>";
      return;
    }
    const v = sum(rows, (d) => d.vinculos);
    const m = sum(rows, (d) => d.massa_salarial);
    const sal = safeDiv(m, v);
    const rel = safeDiv(sal, ref.refSalary);
    const shareV = safeDiv(v, ref.totalVinc);
    const shareM = safeDiv(m, ref.totalMass);
    const highHigh = rows.filter((d) => d.classificacao_analitica === "Alta remuneração e alto número de vínculos").length;
    const highestPriority = rows.slice().sort((a, b) => b.indice_priorizacao - a.indice_priorizacao)[0];
    const sentences = [];

    if (rel >= 1.05 && shareV < 0.05) {
      sentences.push("As atividades selecionadas apresentam remuneração acima da referência nacional, mas concentram participação relativamente baixa nos vínculos formais. Esse padrão sugere sofisticação salarial com escala ocupacional limitada.");
    } else if (rel >= 1 && shareV >= 0.05) {
      sentences.push("O conjunto selecionado combina remuneração superior à referência nacional com participação relevante nos vínculos, indicando maior interesse econômico e ocupacional para diagnóstico de diversificação produtiva.");
    } else if (rel < 1 && shareV >= 0.05) {
      sentences.push("Apesar do número expressivo de vínculos, a remuneração ponderada está abaixo da referência nacional, sugerindo menor capacidade média de geração de renda por trabalhador.");
    } else {
      sentences.push("O conjunto filtrado apresenta escala ocupacional limitada e remuneração abaixo ou próxima da referência nacional, o que recomenda cautela antes de interpretar prioridade econômica.");
    }

    if (shareM >= shareV && rel >= 1) {
      sentences.push("A participação na massa salarial é proporcionalmente maior que a participação nos vínculos, reforçando a presença de atividades com remuneração relativa elevada.");
    } else {
      sentences.push("A participação na massa salarial não supera substancialmente a participação nos vínculos, indicando que a relevância econômica decorre mais da escala de emprego do que de remunerações muito superiores.");
    }

    sentences.push(`${fmtNum.format(highHigh)} atividade(s) aparecem no quadrante de alta remuneração e alto emprego. Essas atividades podem ser candidatas a análise adicional, desde que compatíveis com objetivos setoriais, territoriais e ambientais da política pública.`);

    if (highestPriority) {
      sentences.push(`Pelo índice exploratório atualmente ponderado, a atividade mais bem posicionada é “${formatActivity(highestPriority)}”. Essa indicação deve ser tratada como triagem, não como recomendação final.`);
    }

    sentences.push("A decisão de incentivo público também deve considerar encadeamentos produtivos, externalidades, inovação, sustentabilidade, concentração de mercado, aderência territorial e potencial efetivo de diversificação produtiva.");
    els.policy.innerHTML = sentences.map((s) => `<p>${s}</p>`).join("");
  }

  function renderStats(rows) {
    const vals = rows.map((d) => d.salario).filter(Number.isFinite);
    const q1 = quantile(vals, 0.25);
    const q3 = quantile(vals, 0.75);
    const iqr = q3 - q1;
    const lowFence = q1 - 1.5 * iqr;
    const highFence = q3 + 1.5 * iqr;
    const outliers = vals.filter((v) => v < lowFence || v > highFence).length;
    const stats = [
      ["Média simples", fmtBRL1.format(mean(vals))],
      ["Mediana", fmtBRL1.format(median(vals))],
      ["Desvio-padrão", fmtBRL1.format(std(vals))],
      ["Coef. de variação", `${fmtPp.format(safeDiv(std(vals), mean(vals)) * 100)}%`],
      ["Mínimo", fmtBRL1.format(Math.min(...vals))],
      ["Máximo", fmtBRL1.format(Math.max(...vals))],
      ["Quartil 1", fmtBRL1.format(q1)],
      ["Quartil 3", fmtBRL1.format(q3)],
      ["Intervalo interquartil", fmtBRL1.format(iqr)],
      ["Percentil 10", fmtBRL1.format(quantile(vals, 0.10))],
      ["Percentil 90", fmtBRL1.format(quantile(vals, 0.90))],
      ["Assimetria", fmtNum1.format(skewness(vals))],
      ["Outliers salariais", fmtNum.format(outliers)]
    ];
    if (!vals.length) {
      els.stats.innerHTML = `<div class="empty">Sem dados para calcular estatísticas.</div>`;
      return;
    }
    els.stats.innerHTML = stats.map(([label, value]) => `
      <div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>
    `).join("");
  }

  function rankRows(rows) {
    const mode = els.rankingMode.value;
    const topN = Number(els.topN.value);
    const key = mode === "priority" ? "indice_priorizacao" : mode === "links" ? "vinculos" : mode === "mass" ? "massa_salarial" : "salario";
    const dir = mode === "bottom" ? 1 : -1;
    return rows.slice().sort((a, b) => dir * ((a[key] || 0) - (b[key] || 0))).slice(0, topN);
  }

  function renderRanking(rows) {
    const data = rankRows(rows);
    state.rankedRows = data;
    const el = document.getElementById("chartRanking");
    if (!data.length) return empty(el);
    const mode = els.rankingMode.value;
    const metricKey = mode === "priority" ? "indice_priorizacao" : mode === "links" ? "vinculos" : mode === "mass" ? "massa_salarial" : "salario";
    const w = 850, rowH = 26, margin = { top: 20, right: 140, bottom: 30, left: 300 };
    const h = Math.max(340, margin.top + margin.bottom + data.length * rowH);
    const maxV = Math.max(...data.map((d) => d[metricKey]));
    const minV = Math.min(...data.map((d) => d[metricKey]));
    const domainMax = maxV === minV ? maxV + 1 : maxV;
    const x = (v) => margin.left + safeDiv(v, domainMax) * (w - margin.left - margin.right);
    const fmt = metricKey === "salario" ? fmtBRL1 : metricKey === "massa_salarial" ? fmtBRL : metricKey === "indice_priorizacao" ? { format: (v) => fmtNum1.format(v) } : fmtNum;
    let html = `<svg viewBox="0 0 ${w} ${h}" aria-label="Ranking por atividade">`;
    data.forEach((d, i) => {
      const y = margin.top + i * rowH;
      const bw = Math.max(2, x(d[metricKey]) - margin.left);
      html += `<text x="${margin.left - 8}" y="${y + 17}" text-anchor="end" class="text-label">${escapeHtml(ellipsize(formatActivity(d), 50))}</text>`;
      html += `<rect class="bar ${d.diferenca_pct < 0 ? "negative" : ""}" x="${margin.left}" y="${y + 5}" width="${bw}" height="16" rx="6" data-i="${i}"></rect>`;
      html += `<text x="${margin.left + bw + 8}" y="${y + 17}" class="text-small">${fmt.format(d[metricKey])}</text>`;
    });
    html += `<text x="${margin.left}" y="${h - 6}" class="axis-label">Nível: ${levelByKey[els.nivel.value].label}. Clique/hover para detalhes na tabela.</text></svg>`;
    el.innerHTML = html;
    bindSvgTooltips(el, data, "ranking");
  }

  function renderScatter(rows, ref) {
    const el = document.getElementById("chartScatter");
    if (!rows.length) return empty(el);
    const w = 850, h = 430, m = { top: 20, right: 28, bottom: 60, left: 70 };
    const xVals = rows.map((d) => Math.log10(Math.max(1, d.vinculos)));
    const yVals = rows.map((d) => d.salario_relativo);
    const xMin = Math.min(...xVals), xMax = Math.max(...xVals);
    const yMax = Math.max(1.2, Math.max(...yVals) * 1.08);
    const x = (v) => m.left + safeDiv(Math.log10(Math.max(1, v)) - xMin, xMax - xMin || 1) * (w - m.left - m.right);
    const y = (v) => h - m.bottom - safeDiv(v, yMax) * (h - m.top - m.bottom);
    const r = (d) => 4 + 22 * Math.sqrt(Math.max(0, d.share_massa_salarial));
    let html = `<svg viewBox="0 0 ${w} ${h}" aria-label="Dispersão salário e vínculos">`;
    for (let t = 0; t <= 5; t++) {
      const yy = m.top + t * (h - m.top - m.bottom) / 5;
      html += `<line class="gridline" x1="${m.left}" x2="${w - m.right}" y1="${yy}" y2="${yy}"></line>`;
      const val = yMax * (1 - t / 5);
      html += `<text x="${m.left - 10}" y="${yy + 4}" text-anchor="end" class="axis-label">${fmtNum1.format(val)}×</text>`;
    }
    html += `<line class="refline" x1="${m.left}" x2="${w - m.right}" y1="${y(1)}" y2="${y(1)}"></line>`;
    html += `<text x="${m.left + 6}" y="${y(1) - 6}" class="axis-label">Referência nacional</text>`;
    rows.forEach((d, i) => {
      html += `<circle class="dot" cx="${x(d.vinculos)}" cy="${y(d.salario_relativo)}" r="${Math.min(28, r(d))}" fill="${colorFor(d, i)}" data-i="${i}"></circle>`;
    });
    html += `<line x1="${m.left}" x2="${w - m.right}" y1="${h - m.bottom}" y2="${h - m.bottom}" stroke="#98a2b3"></line>`;
    html += `<line x1="${m.left}" x2="${m.left}" y1="${m.top}" y2="${h - m.bottom}" stroke="#98a2b3"></line>`;
    html += `<text x="${w / 2}" y="${h - 18}" text-anchor="middle" class="axis-label">Número de vínculos formais (escala log)</text>`;
    html += `<text transform="translate(20 ${h / 2}) rotate(-90)" text-anchor="middle" class="axis-label">Salário relativo à referência nacional</text>`;
    html += `</svg>`;
    el.innerHTML = html;
    bindSvgTooltips(el, rows, "scatter");
  }

  function colorFor(d, i) {
    const crit = els.criterio.value;
    if (crit === "quartis") return cssColor(["Q1", "Q2", "Q3", "Q4"].indexOf(d.quartil_salarial));
    if (crit === "decis") return cssColor(Number(String(d.decil_salarial).replace("D", "")) - 1);
    if (crit === "jenks") return cssColor(Number(String(d.jenks_classe).replace("Classe ", "")) - 1);
    if (crit === "media") return d.acima_media_nacional ? "#2f9e73" : "#c2410c";
    if (crit === "mediana") return d.acima_mediana_atividades ? "#1f6feb" : "#f28444";
    return cssColor(i);
  }

  function bindSvgTooltips(el, data) {
    el.querySelectorAll("[data-i]").forEach((node) => {
      node.addEventListener("mousemove", (ev) => {
        const d = data[Number(node.dataset.i)];
        showTooltip(`
          <strong>${escapeHtml(formatActivity(d))}</strong><br>
          Salário: ${fmtBRL1.format(d.salario)}<br>
          Vínculos: ${fmtNum.format(d.vinculos)}<br>
          Massa salarial: ${fmtBRL.format(d.massa_salarial)}<br>
          Salário relativo: ${fmtNum1.format(d.salario_relativo)}×<br>
          Índice: ${fmtNum1.format(d.indice_priorizacao)}
        `, ev);
      });
      node.addEventListener("mouseleave", hideTooltip);
    });
  }

  function renderBoxplot(rows) {
    const el = document.getElementById("chartBoxplot");
    if (!rows.length) return empty(el);
    const groupKey = "secao_cod";
    const groupName = "secao_nome";
    const groups = [...groupBy(rows, (d) => d[groupKey]).entries()]
      .map(([key, arr]) => ({ key, name: arr[0][groupName] || key, rows: arr, vinculos: sum(arr, (d) => d.vinculos) }))
      .sort((a, b) => b.vinculos - a.vinculos)
      .slice(0, 12);
    if (!groups.length) return empty(el);
    const w = 850, h = 360, m = { top: 22, right: 20, bottom: 88, left: 72 };
    const vals = rows.map((d) => d.salario);
    const min = Math.min(...vals), max = Math.max(...vals);
    const y = (v) => h - m.bottom - safeDiv(v - min, max - min || 1) * (h - m.top - m.bottom);
    const band = (w - m.left - m.right) / groups.length;
    let html = `<svg viewBox="0 0 ${w} ${h}" aria-label="Boxplot salarial">`;
    for (let t = 0; t <= 4; t++) {
      const yy = m.top + t * (h - m.top - m.bottom) / 4;
      const val = max - t * (max - min) / 4;
      html += `<line class="gridline" x1="${m.left}" x2="${w - m.right}" y1="${yy}" y2="${yy}"></line>`;
      html += `<text x="${m.left - 10}" y="${yy + 4}" text-anchor="end" class="axis-label">${fmtBRL1.format(val)}</text>`;
    }
    groups.forEach((g, i) => {
      const x = m.left + i * band + band / 2;
      const s = boxStats(g.rows.map((d) => d.salario));
      const boxW = Math.max(16, band * 0.45);
      html += `<line x1="${x}" x2="${x}" y1="${y(s.min)}" y2="${y(s.max)}" stroke="#667085"></line>`;
      html += `<rect x="${x - boxW / 2}" y="${y(s.q3)}" width="${boxW}" height="${Math.max(1, y(s.q1) - y(s.q3))}" fill="${cssColor(i)}" opacity=".68" stroke="#344054"></rect>`;
      html += `<line x1="${x - boxW / 2}" x2="${x + boxW / 2}" y1="${y(s.med)}" y2="${y(s.med)}" stroke="#101828" stroke-width="2"></line>`;
      html += `<line x1="${x - boxW / 3}" x2="${x + boxW / 3}" y1="${y(s.min)}" y2="${y(s.min)}" stroke="#667085"></line>`;
      html += `<line x1="${x - boxW / 3}" x2="${x + boxW / 3}" y1="${y(s.max)}" y2="${y(s.max)}" stroke="#667085"></line>`;
      html += `<text x="${x}" y="${h - 58}" text-anchor="end" transform="rotate(-36 ${x} ${h - 58})" class="axis-label">${escapeHtml(g.key)}</text>`;
      html += `<title>${escapeHtml(g.key)} — ${escapeHtml(g.name)}\nMediana: ${fmtBRL1.format(s.med)}\nIQR: ${fmtBRL1.format(s.q3 - s.q1)}</title>`;
    });
    html += `<text x="${w / 2}" y="${h - 16}" text-anchor="middle" class="axis-label">Top 12 seções por número de vínculos na seleção</text>`;
    html += `</svg>`;
    el.innerHTML = html;
  }

  function boxStats(vals) {
    const q1 = quantile(vals, 0.25);
    const q3 = quantile(vals, 0.75);
    const iqr = q3 - q1;
    const low = q1 - 1.5 * iqr;
    const high = q3 + 1.5 * iqr;
    const inFence = vals.filter((v) => v >= low && v <= high);
    return {
      min: Math.min(...inFence),
      q1,
      med: median(vals),
      q3,
      max: Math.max(...inFence),
      lowFence: low,
      highFence: high
    };
  }

  function renderHistogram(rows) {
    const el = document.getElementById("chartHistogram");
    if (!rows.length) return empty(el);
    const vals = rows.map((d) => d.salario).filter(Number.isFinite);
    const bins = 14;
    const min = Math.min(...vals), max = Math.max(...vals);
    const step = (max - min || 1) / bins;
    const hist = Array.from({ length: bins }, (_, i) => ({ x0: min + i * step, x1: min + (i + 1) * step, n: 0 }));
    vals.forEach((v) => {
      const idx = Math.min(bins - 1, Math.floor((v - min) / step));
      hist[idx].n += 1;
    });
    const w = 850, h = 330, m = { top: 20, right: 24, bottom: 62, left: 58 };
    const maxN = Math.max(...hist.map((d) => d.n));
    const x = (i) => m.left + i * (w - m.left - m.right) / bins;
    const y = (v) => h - m.bottom - safeDiv(v, maxN || 1) * (h - m.top - m.bottom);
    const bw = (w - m.left - m.right) / bins - 4;
    let html = `<svg viewBox="0 0 ${w} ${h}" aria-label="Histograma salarial">`;
    hist.forEach((d, i) => {
      html += `<rect x="${x(i) + 2}" y="${y(d.n)}" width="${bw}" height="${h - m.bottom - y(d.n)}" rx="6" fill="${cssColor(i)}" opacity=".82"><title>${fmtBRL1.format(d.x0)} a ${fmtBRL1.format(d.x1)}: ${d.n} atividades</title></rect>`;
      if (i % 3 === 0) html += `<text x="${x(i)}" y="${h - 38}" text-anchor="start" class="axis-label">${fmtBRL1.format(d.x0)}</text>`;
    });
    html += `<line x1="${m.left}" x2="${w - m.right}" y1="${h - m.bottom}" y2="${h - m.bottom}" stroke="#98a2b3"></line>`;
    html += `<line x1="${m.left}" x2="${m.left}" y1="${m.top}" y2="${h - m.bottom}" stroke="#98a2b3"></line>`;
    html += `<text x="${w / 2}" y="${h - 12}" text-anchor="middle" class="axis-label">Faixas de remuneração</text>`;
    html += `<text transform="translate(18 ${h / 2}) rotate(-90)" text-anchor="middle" class="axis-label">Número de atividades</text>`;
    html += `</svg>`;
    el.innerHTML = html;
  }

  function renderTreemap(rows) {
    const el = document.getElementById("chartTreemap");
    if (!rows.length) return empty(el);
    const data = rows.slice().sort((a, b) => b.massa_salarial - a.massa_salarial).slice(0, 55);
    const rects = sliceDiceTreemap(data, 0, 0, 100, 100, true);
    el.innerHTML = `<div class="treemap-wrap">${
      rects.map((r, i) => {
        const d = r.data;
        const color = d.salario_relativo >= 1 ? `rgba(47, 158, 115, ${Math.min(.96, .45 + d.salario_relativo / 4)})` : `rgba(194, 65, 12, ${Math.min(.92, .40 + (1 - d.salario_relativo) / 2)})`;
        const label = r.w * r.h > 90 ? `<strong>${escapeHtml(ellipsize(d.codigo, 16))}</strong><span>${escapeHtml(ellipsize(d.nome, 42))}<br>${fmtBRL.format(d.massa_salarial)}</span>` : "";
        return `<div class="treemap-tile" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;background:${color};" title="${escapeHtml(formatActivity(d))}&#10;Massa: ${fmtBRL.format(d.massa_salarial)}&#10;Salário relativo: ${fmtNum1.format(d.salario_relativo)}x">${label}</div>`;
      }).join("")
    }</div>`;
  }

  function sliceDiceTreemap(data, x, y, w, h, vertical) {
    const total = sum(data, (d) => Math.max(0, d.massa_salarial));
    if (!total || !data.length) return [];
    let offset = 0;
    return data.map((d) => {
      const frac = Math.max(0, d.massa_salarial) / total;
      let r;
      if (vertical) {
        const ww = w * frac;
        r = { x: x + offset, y, w: ww, h, data: d };
        offset += ww;
      } else {
        const hh = h * frac;
        r = { x, y: y + offset, w, h: hh, data: d };
        offset += hh;
      }
      return r;
    });
  }

  function renderStacked(rows, ref) {
    const el = document.getElementById("chartStacked");
    if (!rows.length) return empty(el);
    const groups = [...groupBy(rows, (d) => d.secao_cod).entries()]
      .map(([key, arr]) => ({ key, name: arr[0].secao_nome, vinculos: sum(arr, (d) => d.vinculos), massa: sum(arr, (d) => d.massa_salarial) }))
      .sort((a, b) => b.vinculos - a.vinculos)
      .slice(0, 10);
    const totalV = sum(groups, (d) => d.vinculos);
    const totalM = sum(groups, (d) => d.massa);
    const w = 850, h = 300, m = { top: 34, right: 25, bottom: 88, left: 130 };
    let html = `<svg viewBox="0 0 ${w} ${h}" aria-label="Barras empilhadas 100%">`;
    html += stackedBar(groups, "vinculos", totalV, 70, w, m, "Vínculos");
    html += stackedBar(groups, "massa", totalM, 150, w, m, "Massa salarial");
    groups.forEach((g, i) => {
      const lx = m.left + i * 70;
      const ly = h - 60 + Math.floor(i / 5) * 22;
      const col = m.left + (i % 5) * 140;
      html += `<rect x="${col}" y="${ly - 10}" width="12" height="12" rx="3" fill="${cssColor(i)}"></rect>`;
      html += `<text x="${col + 16}" y="${ly}" class="axis-label">${escapeHtml(g.key)}</text>`;
    });
    html += `<text x="${w / 2}" y="${h - 12}" text-anchor="middle" class="axis-label">Top 10 seções por vínculos dentro da seleção</text></svg>`;
    el.innerHTML = html;
  }

  function stackedBar(groups, key, total, y, w, m, label) {
    let x0 = m.left;
    let html = `<text x="${m.left - 10}" y="${y + 18}" text-anchor="end" class="text-label">${label}</text>`;
    groups.forEach((g, i) => {
      const width = safeDiv(g[key], total) * (w - m.left - m.right);
      html += `<rect x="${x0}" y="${y}" width="${width}" height="34" rx="4" fill="${cssColor(i)}"><title>${g.key} — ${g.name}\n${label}: ${key === "massa" ? fmtBRL.format(g[key]) : fmtNum.format(g[key])}\nParticipação: ${fmtPct.format(safeDiv(g[key], total))}</title></rect>`;
      if (width > 50) html += `<text x="${x0 + width / 2}" y="${y + 22}" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">${fmtPct.format(safeDiv(g[key], total))}</text>`;
      x0 += width;
    });
    return html;
  }

  function renderMatrix(rows, ref) {
    const el = document.getElementById("chartMatrix");
    if (!rows.length) return empty(el);
    const w = 850, h = 430, m = { top: 30, right: 28, bottom: 62, left: 78 };
    const xMax = Math.max(...rows.map((d) => d.share_vinculos)) * 1.08 || 1;
    const yMax = Math.max(1.2, Math.max(...rows.map((d) => d.salario_relativo)) * 1.08);
    const xMid = median(rows.map((d) => d.share_vinculos));
    const x = (v) => m.left + safeDiv(v, xMax) * (w - m.left - m.right);
    const y = (v) => h - m.bottom - safeDiv(v, yMax) * (h - m.top - m.bottom);
    let html = `<svg viewBox="0 0 ${w} ${h}" aria-label="Matriz de priorização">`;
    html += `<rect x="${x(xMid)}" y="${m.top}" width="${w - m.right - x(xMid)}" height="${y(1) - m.top}" fill="#e8f7ef" opacity=".75"></rect>`;
    html += `<rect x="${m.left}" y="${m.top}" width="${x(xMid) - m.left}" height="${y(1) - m.top}" fill="#eef4ff" opacity=".75"></rect>`;
    html += `<rect x="${x(xMid)}" y="${y(1)}" width="${w - m.right - x(xMid)}" height="${h - m.bottom - y(1)}" fill="#fff3e6" opacity=".8"></rect>`;
    html += `<rect x="${m.left}" y="${y(1)}" width="${x(xMid) - m.left}" height="${h - m.bottom - y(1)}" fill="#f6f7fb" opacity=".8"></rect>`;
    html += `<line class="refline" x1="${m.left}" x2="${w - m.right}" y1="${y(1)}" y2="${y(1)}"></line>`;
    html += `<line class="refline" x1="${x(xMid)}" x2="${x(xMid)}" y1="${m.top}" y2="${h - m.bottom}"></line>`;
    html += `<text x="${x(xMid) + 6}" y="${m.top + 16}" class="axis-label">Mediana dos vínculos</text>`;
    html += `<text x="${m.left + 6}" y="${y(1) - 6}" class="axis-label">Referência nacional</text>`;
    rows.forEach((d, i) => {
      html += `<circle class="dot" cx="${x(d.share_vinculos)}" cy="${y(d.salario_relativo)}" r="${5 + Math.min(16, Math.sqrt(d.share_massa_salarial) * 70)}" fill="${colorFor(d, i)}" data-i="${i}"></circle>`;
    });
    html += `<line x1="${m.left}" x2="${w - m.right}" y1="${h - m.bottom}" y2="${h - m.bottom}" stroke="#98a2b3"></line>`;
    html += `<line x1="${m.left}" x2="${m.left}" y1="${m.top}" y2="${h - m.bottom}" stroke="#98a2b3"></line>`;
    html += `<text x="${w / 2}" y="${h - 18}" text-anchor="middle" class="axis-label">Participação nos vínculos formais</text>`;
    html += `<text transform="translate(22 ${h / 2}) rotate(-90)" text-anchor="middle" class="axis-label">Salário relativo</text>`;
    html += `<text x="${w - m.right - 5}" y="${m.top + 18}" text-anchor="end" class="text-small">alta remuneração + alto emprego</text>`;
    html += `</svg>`;
    el.innerHTML = html;
    bindSvgTooltips(el, rows, "matrix");
  }

  function groupBy(arr, fn) {
    const map = new Map();
    arr.forEach((d) => {
      const key = fn(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    });
    return map;
  }

  function sortRowsForTable(rows) {
    const { key, dir } = state.tableSort;
    const mult = dir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const av = a[key], bv = b[key];
      if (typeof av === "number" && typeof bv === "number") return mult * (av - bv);
      return mult * String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR", { numeric: true });
    });
  }

  function renderTable(rows) {
    const search = (els.search.value || "").trim().toLowerCase();
    let filtered = rows;
    if (search) {
      filtered = rows.filter((d) => Object.values(d).some((v) => String(v).toLowerCase().includes(search)));
    }
    const limit = 300;
    const visible = filtered.slice(0, limit);
    const columns = [
      ["codigo", "Código CNAE"],
      ["nome", "Descrição da atividade"],
      ["secao_cod", "Seção"],
      ["divisao_cod", "Divisão"],
      ["grupo_cod", "Grupo"],
      ["classe_cod", "Classe"],
      ["subclasse_cod", "Subclasse"],
      ["vinculos", "Vínculos"],
      ["salario", "Salário/mediana"],
      ["massa_salarial", "Massa salarial"],
      ["salario_relativo", "Salário relativo"],
      ["diferenca_abs", "Dif. absoluta"],
      ["diferenca_pct", "Dif. %"],
      ["quartil_salarial", "Quartil salarial"],
      ["quartil_vinculos", "Quartil vínculos"],
      ["jenks_classe", "Classe Jenks"],
      ["ranking_salarial", "Rank salário"],
      ["ranking_vinculos", "Rank vínculos"],
      ["ranking_massa_salarial", "Rank massa"],
      ["indice_priorizacao", "Índice"],
      ["ranking_priorizacao", "Rank índice"],
      ["classificacao_analitica", "Classificação"]
    ];
    const thead = els.table.querySelector("thead");
    const tbody = els.table.querySelector("tbody");
    thead.innerHTML = `<tr>${columns.map(([key, label]) => `<th data-key="${key}" class="${isNumericKey(key) ? "num" : ""}">${label}${state.tableSort.key === key ? (state.tableSort.dir === "asc" ? " ▲" : " ▼") : ""}</th>`).join("")}</tr>`;
    tbody.innerHTML = visible.map((d) => `<tr>${columns.map(([key]) => `<td class="${isNumericKey(key) ? "num" : ""}">${formatCell(key, d[key])}</td>`).join("")}</tr>`).join("");
    els.tableInfo.textContent = `Mostrando ${fmtNum.format(visible.length)} de ${fmtNum.format(filtered.length)} atividades filtradas. A exportação inclui todas as linhas filtradas, não apenas as visíveis.`;
    thead.querySelectorAll("th").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        state.tableSort = { key, dir: state.tableSort.key === key && state.tableSort.dir === "desc" ? "asc" : "desc" };
        state.tableRows = sortRowsForTable(state.tableRows);
        renderTable(state.tableRows);
      });
    });
  }

  function isNumericKey(key) {
    return ["vinculos", "salario", "massa_salarial", "salario_relativo", "diferenca_abs", "diferenca_pct", "ranking_salarial", "ranking_vinculos", "ranking_massa_salarial", "indice_priorizacao", "ranking_priorizacao"].includes(key);
  }

  function formatCell(key, value) {
    if (value === undefined || value === null) return "";
    if (key === "salario" || key === "diferenca_abs") return fmtBRL1.format(value);
    if (key === "massa_salarial") return fmtBRL.format(value);
    if (key === "salario_relativo") return `${fmtNum1.format(value)}×`;
    if (key === "diferenca_pct" || key.startsWith("share")) return `${fmtPp.format(value)}%`;
    if (key === "indice_priorizacao") return fmtNum1.format(value);
    if (key === "vinculos" || key.startsWith("ranking")) return fmtNum.format(value);
    return escapeHtml(String(value));
  }

  function empty(el) {
    el.innerHTML = `<div class="empty">Sem dados para os filtros selecionados.</div>`;
  }

  function exportCSV(rows, filename) {
    const exportRows = rows.map((d) => ({
      nivel: d.nivel,
      codigo_cnae: d.codigo,
      descricao: d.nome,
      secao: d.secao_cod,
      divisao: d.divisao_cod,
      grupo: d.grupo_cod,
      classe: d.classe_cod,
      subclasse: d.subclasse_cod,
      vinculos: Math.round(d.vinculos),
      salario_mediana_ponderada: d.salario,
      massa_salarial: d.massa_salarial,
      salario_relativo: d.salario_relativo,
      diferenca_abs: d.diferenca_abs,
      diferenca_pct: d.diferenca_pct,
      share_vinculos: d.share_vinculos,
      share_massa_salarial: d.share_massa_salarial,
      quartil_salarial: d.quartil_salarial,
      quartil_vinculos: d.quartil_vinculos,
      jenks_classe: d.jenks_classe,
      ranking_salarial: d.ranking_salarial,
      ranking_vinculos: d.ranking_vinculos,
      ranking_massa_salarial: d.ranking_massa_salarial,
      indice_priorizacao: d.indice_priorizacao,
      ranking_priorizacao: d.ranking_priorizacao,
      classificacao_analitica: d.classificacao_analitica
    }));
    const header = Object.keys(exportRows[0] || { sem_dados: "" });
    const csv = "\ufeff" + [
      header.join(";"),
      ...exportRows.map((row) => header.map((k) => csvValue(row[k])).join(";"))
    ].join("\n");
    downloadText(csv, filename, "text/csv;charset=utf-8");
  }

  function csvValue(v) {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  }

  function downloadText(text, filename, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  if (!rawData.length) {
    document.body.innerHTML = "<main class='notice'>Nenhum dado foi carregado. Verifique se o arquivo data.js está no mesmo diretório do index.html.</main>";
    return;
  }

  initControls();
  update();
})();
