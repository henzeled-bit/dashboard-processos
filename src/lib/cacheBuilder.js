import { supabase } from './supabase'

// Busca todos os processos em páginas e retorna array completo
async function fetchAllProcessos() {
  let all = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data } = await supabase
      .from('processos')
      .select('createdate,closedate,closedatepartial,distributiondate,team,namestate,closereason,totalvalue,namearea')
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    all = [...all, ...data]
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

function daysDiff(d1, d2) {
  if (!d1 || !d2) return null
  return Math.round((new Date(d2) - new Date(d1)) / 86400000)
}

function calcMedia(arr, fn) {
  const vals = arr.map(fn).filter(v => v !== null && !isNaN(v))
  return vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null
}

function cleanNull(v) {
  if (!v) return null
  if (typeof v === 'string' && v.trim().toLowerCase() === 'null') return null
  return v
}

export async function buildAndSaveCache(onProgress) {
  onProgress?.('Buscando processos...')
  const all = await fetchAllProcessos()
  onProgress?.(`${all.length.toLocaleString('pt-BR')} processos carregados. Calculando...`)

  // Anos e equipes disponíveis
  const anosSet = new Set()
  const equipesSet = new Set()
  all.forEach(p => {
    if (p.createdate) anosSet.add(p.createdate.substring(0, 4))
    if (p.closedate) anosSet.add(p.closedate.substring(0, 4))
    if (p.team) equipesSet.add(p.team)
  })
  const anos = [...anosSet].sort().reverse()
  const equipes = [...equipesSet].sort()

  // Gera cache para cada combinação de filtro (equipe x ano)
  // Para não explodir, fazemos: "Todas" x cada_ano + cada_equipe x "Todos" + cada_equipe x cada_ano
  const combos = []
  combos.push({ equipe: 'Todas', ano: 'Todos' })
  anos.forEach(a => combos.push({ equipe: 'Todas', ano: a }))
  equipes.forEach(e => {
    combos.push({ equipe: e, ano: 'Todos' })
    anos.forEach(a => combos.push({ equipe: e, ano: a }))
  })

  for (let ci = 0; ci < combos.length; ci++) {
    const { equipe, ano } = combos[ci]
    onProgress?.(`Calculando ${ci + 1}/${combos.length}: ${equipe} / ${ano}`)

    const anoFilter = ano !== 'Todos'
    const eqFilter = equipe !== 'Todas'

    const rows = all.filter(p => {
      if (eqFilter && p.team !== equipe) return false
      if (anoFilter) {
        return p.createdate?.startsWith(ano) || p.closedate?.startsWith(ano)
      }
      return true
    })

    const encerradosNoPeriodo = rows.filter(p => p.closedate && (!anoFilter || p.closedate.startsWith(ano)))
    const cadastrosNoPeriodo = rows.filter(p => !anoFilter || p.createdate?.startsWith(ano))
    const ativos = all.filter(p => {
      if (eqFilter && p.team !== equipe) return false
      return !p.closedate
    })

    // Prazo 30d
    const comPrazo = encerradosNoPeriodo.filter(p => {
      if (!p.closedatepartial || !p.closedate) return false
      const motivo = (p.closereason || '').toLowerCase()
      if (motivo.includes('acerto de base') || motivo.includes('migrado com baixa')) return false
      return true
    })
    const dentro = comPrazo.filter(p => daysDiff(p.closedatepartial, p.closedate) <= 30)
    const pctDentro = comPrazo.length > 0 ? Math.round(dentro.length / comPrazo.length * 100) : 0

    // Valor
    // Valor da causa: apenas processos ATIVOS (sem closedate)
    const ativosParaValor = rows.filter(p => !p.closedate && parseFloat(p.totalvalue) > 0)
    const valoresOrdenados = ativosParaValor.map(p => parseFloat(p.totalvalue)).sort((a, b) => a - b)

    // Mediana
    const mid = Math.floor(valoresOrdenados.length / 2)
    const mediana = valoresOrdenados.length === 0 ? 0
      : valoresOrdenados.length % 2 === 0
        ? (valoresOrdenados[mid - 1] + valoresOrdenados[mid]) / 2
        : valoresOrdenados[mid]

    // Limite = 3x a mediana
    const limiteOutlier = mediana * 3

    // Normais = abaixo do limite (exceto RJ que aceita todos)
    const isRJ = equipe === 'RJ'
    const ativosNormais = isRJ ? ativosParaValor : ativosParaValor.filter(p => parseFloat(p.totalvalue) <= limiteOutlier)
    const ativosEspeciais = isRJ ? [] : ativosParaValor.filter(p => parseFloat(p.totalvalue) > limiteOutlier)

    const valorTotal = ativosParaValor.reduce((s, p) => s + (parseFloat(p.totalvalue) || 0), 0)
    const valorNormais = ativosNormais.reduce((s, p) => s + (parseFloat(p.totalvalue) || 0), 0)
    const valorEspeciais = ativosEspeciais.reduce((s, p) => s + (parseFloat(p.totalvalue) || 0), 0)
    const valorMedioAtivos = ativosNormais.length > 0 ? valorNormais / ativosNormais.length : 0
    const valorMedioEspeciais = ativosEspeciais.length > 0 ? valorEspeciais / ativosEspeciais.length : 0

    // Tempos
    // Processos com ambas as datas preenchidas
    const comAmbas = cadastrosNoPeriodo.filter(p => p.distributiondate && p.createdate)
    const totalComAmbas = comAmbas.length

    // Perfil 1: Nós ajuizamos (cad ANTES do ajuizamento) — só Ativas
    const nosAjuizamos = comAmbas.filter(p => daysDiff(p.distributiondate, p.createdate) < 0)
    const tempoCadAjuiz = nosAjuizamos.length > 0
      ? calcMedia(nosAjuizamos, p => Math.abs(daysDiff(p.distributiondate, p.createdate)))
      : null
    const pctNosAjuizamos = totalComAmbas > 0
      ? Math.round(nosAjuizamos.length / totalComAmbas * 100)
      : 0

    // Perfil 2: Recebidos em andamento (cad APÓS ajuizamento)
    const recebidosEmAndamento = comAmbas.filter(p => daysDiff(p.distributiondate, p.createdate) > 0)
    const tempoAjuizCad = recebidosEmAndamento.length > 0
      ? calcMedia(recebidosEmAndamento, p => daysDiff(p.distributiondate, p.createdate))
      : null
    const pctRecebidosAndamento = totalComAmbas > 0
      ? Math.round(recebidosEmAndamento.length / totalComAmbas * 100)
      : 0
    const tempoCadEnc = calcMedia(encerradosNoPeriodo.filter(p => p.createdate && p.closedate), p => Math.abs(daysDiff(p.createdate, p.closedate)))
    const tempoAjuizEnc = calcMedia(encerradosNoPeriodo.filter(p => p.distributiondate && p.closedate), p => Math.abs(daysDiff(p.distributiondate, p.closedate)))

    // Gráfico mensal
    const mesesMap = {}
    rows.forEach(p => {
      if (p.createdate && (!anoFilter || p.createdate.startsWith(ano))) {
        const m = p.createdate.substring(0, 7)
        mesesMap[m] = mesesMap[m] || { mes: m, Cadastros: 0, Encerramentos: 0 }
        mesesMap[m].Cadastros++
      }
      if (p.closedate && (!anoFilter || p.closedate.startsWith(ano))) {
        const m = p.closedate.substring(0, 7)
        mesesMap[m] = mesesMap[m] || { mes: m, Cadastros: 0, Encerramentos: 0 }
        mesesMap[m].Encerramentos++
      }
    })
    let acum = 0
    const mesesData = Object.values(mesesMap).sort((a, b) => a.mes.localeCompare(b.mes)).map(d => {
      acum += d.Cadastros - d.Encerramentos
      return { ...d, mes: d.mes.replace('-', '/'), Ativos: Math.max(0, acum) }
    })

    // Evolução anual (sempre sem filtro de ano)
    const anoMap = {}
    const rowsParaEvolucao = eqFilter ? all.filter(p => p.team === equipe) : all
    rowsParaEvolucao.forEach(p => {
      if (p.createdate) { const a = p.createdate.substring(0,4); anoMap[a] = anoMap[a]||{ano:a,Cadastros:0,Encerramentos:0}; anoMap[a].Cadastros++ }
      if (p.closedate) { const a = p.closedate.substring(0,4); anoMap[a] = anoMap[a]||{ano:a,Cadastros:0,Encerramentos:0}; anoMap[a].Encerramentos++ }
    })
    let baseAcum = 0
    const evolucaoBase = Object.values(anoMap).sort((a,b) => a.ano.localeCompare(b.ano)).map(d => {
      baseAcum += d.Cadastros - d.Encerramentos
      return { ...d, Base: Math.max(0, baseAcum) }
    })

    // Por equipe
    const equipesMap = {}
    rows.forEach(p => {
      const e2 = p.team || 'Sem Equipe'
      equipesMap[e2] = equipesMap[e2] || { equipe: e2, Ativos: 0, Encerrados: 0, Valor: 0 }
      if (p.closedate) equipesMap[e2].Encerrados++
      else equipesMap[e2].Ativos++
      equipesMap[e2].Valor += parseFloat(p.totalvalue) || 0
    })
    const equipesData = Object.values(equipesMap)

    // Prazo por equipe
    const prazoEqMap = {}
    comPrazo.forEach(p => {
      const e2 = p.team || 'Sem Equipe'
      prazoEqMap[e2] = prazoEqMap[e2] || { equipe: e2, 'Dentro do Prazo': 0, 'Fora do Prazo': 0 }
      if (daysDiff(p.closedatepartial, p.closedate) <= 30) prazoEqMap[e2]['Dentro do Prazo']++
      else prazoEqMap[e2]['Fora do Prazo']++
    })
    const prazoEquipeData = Object.values(prazoEqMap)

    // Motivos
    const motivosMap = {}
    encerradosNoPeriodo.forEach(p => {
      const m = cleanNull(p.closereason)
      if (m) motivosMap[m] = (motivosMap[m] || 0) + 1
    })
    const motivosData = Object.entries(motivosMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 8)

    // Estados
    const estadosMap = {}
    rows.forEach(p => { if (p.namestate) estadosMap[p.namestate] = (estadosMap[p.namestate] || 0) + 1 })
    const estadosData = Object.entries(estadosMap).map(([estado, total]) => ({ estado, total })).sort((a,b) => b.total - a.total).slice(0, 8)

    const cacheKey = `stats_${equipe}_${ano}`
    const cacheData = {
      ativos: ativos.length,
      cadastros: cadastrosNoPeriodo.length,
      encerrados: encerradosNoPeriodo.length,
      pctDentro, dentroPrazo: dentro.length, comPrazo: comPrazo.length,
      valorTotal, valorNormais, valorEspeciais, valorMedioAtivos, valorMedioEspeciais,
      countEspeciais: ativosEspeciais.length, countNormais: ativosNormais.length,
      mediana, limiteOutlier,
      tempoAjuizCad, tempoCadAjuiz, pctNosAjuizamos, pctRecebidosAndamento,
      nosAjuizamosCount: nosAjuizamos.length, recebidosAndamentoCount: recebidosEmAndamento.length,
      tempoCadEnc, tempoAjuizEnc,
      mesesData, evolucaoBase, equipesData, prazoEquipeData, motivosData, estadosData
    }

    await supabase.from('dashboard_cache').upsert({ id: cacheKey, data: cacheData, updated_at: new Date().toISOString() })
  }

  // Salva metadados
  await supabase.from('dashboard_cache').upsert({
    id: 'meta',
    data: { anos, equipes, totalBase: all.length },
    updated_at: new Date().toISOString()
  })

  onProgress?.('✅ Cache atualizado com sucesso!')
  return { anos, equipes, totalBase: all.length }
}
