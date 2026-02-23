import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']
const TEAM_COLORS = {
  'Ativas': '#3b82f6', 'Superendividamento': '#10b981', 'Imobiliário': '#f59e0b',
  'Planos': '#8b5cf6', 'RJ': '#ef4444', 'Passivas': '#06b6d4', 'Sem Equipe': '#6b7280'
}

function StatCard({ title, value, subtitle, icon, color = '#3b82f6' }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '24px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div style={{ fontSize: '24px', marginBottom: '12px' }}>{icon}</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
      <div style={{ color: '#fff', fontSize: '32px', fontWeight: '700', letterSpacing: '-1px' }}>{value}</div>
      {subtitle && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', marginTop: '6px' }}>{subtitle}</div>}
    </div>
  )
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: '600', margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginTop: '4px' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '12px 16px' }}>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '8px' }}>{label}</p>
      {payload.map((e, i) => (
        <p key={i} style={{ color: e.color, fontSize: '14px', fontWeight: '600' }}>
          {e.name}: {typeof e.value === 'number' ? e.value.toLocaleString('pt-BR') : e.value}
        </p>
      ))}
    </div>
  )
}

// Conta registros com filtros via Supabase
async function countQuery(filters) {
  let q = supabase.from('processos').select('*', { count: 'exact', head: true })
  if (filters.team) q = q.eq('team', filters.team)
  if (filters.createdate_gte) q = q.gte('createdate', filters.createdate_gte)
  if (filters.createdate_lte) q = q.lte('createdate', filters.createdate_lte)
  if (filters.closedate_gte) q = q.gte('closedate', filters.closedate_gte)
  if (filters.closedate_lte) q = q.lte('closedate', filters.closedate_lte)
  if (filters.closedate_null) q = q.is('closedate', null)
  if (filters.closedate_not_null) q = q.not('closedate', 'is', null)
  if (filters.closedatepartial_not_null) q = q.not('closedatepartial', 'is', null)
  const { count } = await q
  return count || 0
}

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [filtroEquipe, setFiltroEquipe] = useState('Todas')
  const [filtroAno, setFiltroAno] = useState('Todos')
  const [fetching, setFetching] = useState(true)
  const [stats, setStats] = useState(null)
  const [anos, setAnos] = useState([])
  const [equipes, setEquipes] = useState([])

  useEffect(() => { if (!loading && !user) router.push('/') }, [user, loading])
  useEffect(() => { if (user) fetchMeta().then(() => fetchStats()) }, [user])
  useEffect(() => { if (user && anos.length > 0) fetchStats() }, [filtroEquipe, filtroAno])

  const fetchMeta = async () => {
    // Equipes distintas
    const { data: eqData } = await supabase.from('processos').select('team').not('team', 'is', null).limit(10000)
    setEquipes([...new Set((eqData || []).map(r => r.team).filter(Boolean))].sort())

    // Anos distintos via SQL
    const { data: anosData } = await supabase.rpc('get_anos_distintos').catch(() => ({ data: null }))
    if (anosData) {
      setAnos(anosData.map(r => r.ano).filter(Boolean).sort().reverse())
    } else {
      // fallback
      const { data: d1 } = await supabase.from('processos').select('createdate').not('createdate', 'is', null).limit(5000)
      const { data: d2 } = await supabase.from('processos').select('closedate').not('closedate', 'is', null).limit(5000)
      const s = new Set()
      ;(d1||[]).forEach(r => r.createdate && s.add(r.createdate.substring(0,4)))
      ;(d2||[]).forEach(r => r.closedate && s.add(r.closedate.substring(0,4)))
      setAnos([...s].sort().reverse())
    }
  }

  const fetchStats = async () => {
    setFetching(true)
    try {
      const eq = filtroEquipe !== 'Todas' ? filtroEquipe : null
      const anoFilter = filtroAno !== 'Todos'
      const anoIni = anoFilter ? `${filtroAno}-01-01` : null
      const anoFim = anoFilter ? `${filtroAno}-12-31` : null

      // ---- CONTAGENS PRINCIPAIS via queries paralelas ----
      const teamFilter = eq ? { team: eq } : {}

      const [ativos, cadastros, encerrados, dentroPrazo, comPrazo] = await Promise.all([
        // Ativos = sem closedate (sem filtro de ano, pois ativos não têm closedate)
        countQuery({ ...teamFilter, closedate_null: true }),
        // Cadastros no ano
        countQuery({ ...teamFilter, ...(anoIni ? { createdate_gte: anoIni, createdate_lte: anoFim } : {}) }),
        // Encerrados no ano
        countQuery({ ...teamFilter, ...(anoIni ? { closedate_gte: anoIni, closedate_lte: anoFim } : { closedate_not_null: true }) }),
        // Dentro do prazo (30 dias) — buscamos amostra para calcular
        0, 0
      ])

      // Valor total — soma via amostra grande
      let qValor = supabase.from('processos').select('totalvalue').limit(50000)
      if (eq) qValor = qValor.eq('team', eq)
      if (anoIni) qValor = qValor.or(`createdate.gte.${anoIni},closedate.gte.${anoIni}`)
      const { data: valorData } = await qValor
      const valorTotal = (valorData || []).reduce((s, p) => s + (parseFloat(p.totalvalue) || 0), 0)

      // Prazo 30 dias — amostra dos encerrados com closedatepartial
      let qPrazo = supabase.from('processos')
        .select('closedate,closedatepartial')
        .not('closedate', 'is', null)
        .not('closedatepartial', 'is', null)
        .limit(10000)
      if (eq) qPrazo = qPrazo.eq('team', eq)
      if (anoIni) qPrazo = qPrazo.gte('closedate', anoIni).lte('closedate', anoFim)
      const { data: prazoData } = await qPrazo
      const prazoRows = prazoData || []
      const dentro = prazoRows.filter(p => Math.round((new Date(p.closedate) - new Date(p.closedatepartial)) / 86400000) <= 30)
      const pctDentro = prazoRows.length > 0 ? Math.round(dentro.length / prazoRows.length * 100) : 0

      // Tempos médios — amostra
      let qTempos = supabase.from('processos')
        .select('createdate,closedate,distributiondate')
        .limit(10000)
      if (eq) qTempos = qTempos.eq('team', eq)
      if (anoIni) qTempos = qTempos.or(`createdate.gte.${anoIni},closedate.gte.${anoIni}`)
      const { data: temposData } = await qTempos
      const tempos = temposData || []

      const calcMedia = (arr, fn) => arr.length > 0 ? Math.round(arr.reduce((s, p) => s + fn(p), 0) / arr.length) : null

      const ajuizCad = tempos.filter(p => p.distributiondate && p.createdate)
      const tempoAjuizCad = calcMedia(ajuizCad, p => Math.abs(Math.round((new Date(p.createdate) - new Date(p.distributiondate)) / 86400000)))

      const cadEnc = tempos.filter(p => p.createdate && p.closedate)
      const tempoCadEnc = calcMedia(cadEnc, p => Math.abs(Math.round((new Date(p.closedate) - new Date(p.createdate)) / 86400000)))

      const ajuizEnc = tempos.filter(p => p.distributiondate && p.closedate)
      const tempoAjuizEnc = calcMedia(ajuizEnc, p => Math.abs(Math.round((new Date(p.closedate) - new Date(p.distributiondate)) / 86400000)))

      // ---- GRÁFICO MENSAL ----
      let qMensal = supabase.from('processos')
        .select('createdate,closedate')
        .limit(50000)
      if (eq) qMensal = qMensal.eq('team', eq)
      if (anoIni) qMensal = qMensal.or(`createdate.gte.${anoIni},closedate.gte.${anoIni}`)
      const { data: mensalData } = await qMensal
      const mensalRows = mensalData || []

      const mesesMap = {}
      mensalRows.forEach(p => {
        if (p.createdate && (!anoIni || p.createdate >= anoIni && p.createdate <= anoFim)) {
          const m = p.createdate.substring(0, 7)
          mesesMap[m] = mesesMap[m] || { mes: m, Cadastros: 0, Encerramentos: 0 }
          mesesMap[m].Cadastros++
        }
        if (p.closedate && (!anoIni || p.closedate >= anoIni && p.closedate <= anoFim)) {
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

      // ---- EVOLUÇÃO ANUAL ----
      let qAnual = supabase.from('processos').select('createdate,closedate').limit(50000)
      if (eq) qAnual = qAnual.eq('team', eq)
      const { data: anualData } = await qAnual
      const anoMap = {}
      ;(anualData || []).forEach(p => {
        if (p.createdate) { const a = p.createdate.substring(0,4); anoMap[a] = anoMap[a]||{ano:a,Cadastros:0,Encerramentos:0}; anoMap[a].Cadastros++ }
        if (p.closedate) { const a = p.closedate.substring(0,4); anoMap[a] = anoMap[a]||{ano:a,Cadastros:0,Encerramentos:0}; anoMap[a].Encerramentos++ }
      })
      let baseAcum = 0
      const evolucaoBase = Object.values(anoMap).sort((a,b) => a.ano.localeCompare(b.ano)).map(d => {
        baseAcum += d.Cadastros - d.Encerramentos
        return { ...d, Base: Math.max(0, baseAcum) }
      })

      // ---- POR EQUIPE ----
      let qEq = supabase.from('processos').select('team,closedate,totalvalue').limit(50000)
      if (eq) qEq = qEq.eq('team', eq)
      if (anoIni) qEq = qEq.or(`createdate.gte.${anoIni},closedate.gte.${anoIni}`)
      const { data: eqData } = await qEq
      const equipesMap = {}
      ;(eqData || []).forEach(p => {
        const e2 = p.team || 'Sem Equipe'
        equipesMap[e2] = equipesMap[e2] || { equipe: e2, Ativos: 0, Encerrados: 0, Valor: 0 }
        if (p.closedate) equipesMap[e2].Encerrados++
        else equipesMap[e2].Ativos++
        equipesMap[e2].Valor += parseFloat(p.totalvalue) || 0
      })
      const equipesData = Object.values(equipesMap)

      // ---- PRAZO POR EQUIPE ----
      const prazoEqMap = {}
      prazoRows.forEach(p => {
        // precisamos team — vamos buscar separado abaixo
      })
      let qPrazoEq = supabase.from('processos')
        .select('team,closedate,closedatepartial')
        .not('closedate', 'is', null)
        .not('closedatepartial', 'is', null)
        .limit(10000)
      if (eq) qPrazoEq = qPrazoEq.eq('team', eq)
      if (anoIni) qPrazoEq = qPrazoEq.gte('closedate', anoIni).lte('closedate', anoFim)
      const { data: prazoEqData } = await qPrazoEq
      ;(prazoEqData || []).forEach(p => {
        const e2 = p.team || 'Sem Equipe'
        prazoEqMap[e2] = prazoEqMap[e2] || { equipe: e2, 'Dentro do Prazo': 0, 'Fora do Prazo': 0 }
        const diff = Math.round((new Date(p.closedate) - new Date(p.closedatepartial)) / 86400000)
        if (diff <= 30) prazoEqMap[e2]['Dentro do Prazo']++
        else prazoEqMap[e2]['Fora do Prazo']++
      })
      const prazoEquipeData = Object.values(prazoEqMap)

      // ---- MOTIVOS ----
      let qMotivos = supabase.from('processos')
        .select('closereason')
        .not('closedate', 'is', null)
        .not('closereason', 'is', null)
        .limit(10000)
      if (eq) qMotivos = qMotivos.eq('team', eq)
      if (anoIni) qMotivos = qMotivos.gte('closedate', anoIni).lte('closedate', anoFim)
      const { data: motivosRaw } = await qMotivos
      const motivosMap = {}
      ;(motivosRaw || []).forEach(p => {
        const m = p.closereason
        if (!m || m.toLowerCase() === 'null' || m.trim() === '') return
        motivosMap[m] = (motivosMap[m] || 0) + 1
      })
      const motivosData = Object.entries(motivosMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 8)

      // ---- ESTADOS ----
      let qEstados = supabase.from('processos').select('namestate').not('namestate', 'is', null).limit(20000)
      if (eq) qEstados = qEstados.eq('team', eq)
      if (anoIni) qEstados = qEstados.or(`createdate.gte.${anoIni},closedate.gte.${anoIni}`)
      const { data: estadosRaw } = await qEstados
      const estadosMap = {}
      ;(estadosRaw || []).forEach(p => { if (p.namestate) estadosMap[p.namestate] = (estadosMap[p.namestate] || 0) + 1 })
      const estadosData = Object.entries(estadosMap).map(([estado, total]) => ({ estado, total })).sort((a,b) => b.total - a.total).slice(0, 8)

      setStats({
        ativos, cadastros, encerrados,
        pctDentro, dentroPrazo: dentro.length, comPrazo: prazoRows.length,
        valorTotal, tempoAjuizCad, tempoCadEnc, tempoAjuizEnc,
        mesesData, evolucaoBase, equipesData, prazoEquipeData, motivosData, estadosData
      })
    } catch (err) { console.error(err) }
    setFetching(false)
  }

  const filterStyle = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }
  const subtitulo = filtroAno !== 'Todos' ? `Ano de ${filtroAno}` : 'Todos os períodos'

  if (loading) return <Layout activeTab="dashboard"><div style={{ textAlign: 'center', padding: '80px', color: 'rgba(255,255,255,0.4)' }}>Carregando...</div></Layout>

  return (
    <Layout activeTab="dashboard">
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Filtrar por:</span>
        <select value={filtroEquipe} onChange={e => setFiltroEquipe(e.target.value)} style={filterStyle}>
          <option value="Todas">Todas as Equipes</option>
          {equipes.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)} style={filterStyle}>
          <option value="Todos">Todos os Anos</option>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={fetchStats} style={{ ...filterStyle, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}>
          {fetching ? '⏳ Carregando...' : '🔄 Atualizar'}
        </button>
        {filtroAno !== 'Todos' && (
          <span style={{ color: '#f59e0b', fontSize: '12px', background: 'rgba(245,158,11,0.1)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.2)' }}>
            📅 {subtitulo}
          </span>
        )}
      </div>

      {fetching && !stats ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'rgba(255,255,255,0.4)' }}>⏳ Calculando métricas...</div>
      ) : stats ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <StatCard title="Processos Ativos" value={stats.ativos.toLocaleString('pt-BR')} subtitle="sem data de encerramento" icon="🟢" color="#10b981" />
            <StatCard title={filtroAno !== 'Todos' ? `Cadastros em ${filtroAno}` : 'Cadastros'} value={stats.cadastros.toLocaleString('pt-BR')} subtitle={subtitulo} icon="📥" color="#3b82f6" />
            <StatCard title={filtroAno !== 'Todos' ? `Encerrados em ${filtroAno}` : 'Encerrados'} value={stats.encerrados.toLocaleString('pt-BR')} subtitle={subtitulo} icon="✅" color="#8b5cf6" />
            <StatCard title="Dentro do Prazo (30d)" value={`${stats.pctDentro}%`} subtitle={`${stats.dentroPrazo} de ${stats.comPrazo} encerramentos`} icon="⏱️" color={stats.pctDentro >= 80 ? '#10b981' : '#ef4444'} />
            <StatCard title="Valor Total" value={`R$ ${((stats.valorTotal || 0) / 1000000).toFixed(1)}M`} subtitle={subtitulo} icon="💰" color="#f59e0b" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            <StatCard title="Tempo Médio Ajuiz→Cad" value={stats.tempoAjuizCad ? `${stats.tempoAjuizCad}d` : '-'} subtitle="dias entre ajuizamento e entrada na base" icon="📋" color="#06b6d4" />
            <StatCard title="Tempo Médio Cad→Enc" value={stats.tempoCadEnc ? `${stats.tempoCadEnc}d` : '-'} subtitle="dias entre cadastro e encerramento PGJ" icon="📅" color="#ec4899" />
            <StatCard title="Tempo Médio Ajuiz→Enc" value={stats.tempoAjuizEnc ? `${stats.tempoAjuizEnc}d` : '-'} subtitle="dias entre ajuizamento e encerramento" icon="📆" color="#f59e0b" />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <ChartCard title={filtroAno !== 'Todos' ? `Movimento Mensal — ${filtroAno}` : 'Movimento Mensal'} subtitle="Cadastros, encerramentos e ativos acumulados">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={stats.mesesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="mes" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }} />
                  <Bar yAxisId="left" dataKey="Cadastros" fill="#3b82f6" radius={[4,4,0,0]} />
                  <Bar yAxisId="left" dataKey="Encerramentos" fill="#10b981" radius={[4,4,0,0]} />
                  <Line yAxisId="right" type="monotone" dataKey="Ativos" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <ChartCard title="Evolução Anual da Base" subtitle="Cadastros, encerramentos e total acumulado por ano">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={stats.evolucaoBase}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="ano" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }} />
                  <Bar yAxisId="left" dataKey="Cadastros" fill="#3b82f6" radius={[4,4,0,0]} />
                  <Bar yAxisId="left" dataKey="Encerramentos" fill="#10b981" radius={[4,4,0,0]} />
                  <Line yAxisId="right" type="monotone" dataKey="Base" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <ChartCard title="Processos por Equipe" subtitle="Ativos e encerrados">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.equipesData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <YAxis dataKey="equipe" type="category" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} width={130} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }} />
                  <Bar dataKey="Ativos" fill="#3b82f6" stackId="a" />
                  <Bar dataKey="Encerrados" fill="#10b981" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Prazo de Encerramento por Equipe" subtitle="Dentro vs fora de 30 dias (TJ → PGJ)">
              {stats.prazoEquipeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={stats.prazoEquipeData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                    <YAxis dataKey="equipe" type="category" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} width={130} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }} />
                    <Bar dataKey="Dentro do Prazo" fill="#10b981" stackId="b" />
                    <Bar dataKey="Fora do Prazo" fill="#ef4444" stackId="b" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.25)', fontSize: '14px' }}>Sem dados de encerramento no período</div>
              )}
            </ChartCard>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <ChartCard title="Motivos de Encerramento" subtitle="Top 8 — processos ativos excluídos">
              {stats.motivosData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats.motivosData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} width={130} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Processos" radius={[0,4,4,0]}>
                      {stats.motivosData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.25)', fontSize: '14px' }}>Sem encerramentos no período</div>
              )}
            </ChartCard>

            <ChartCard title="Processos por Estado" subtitle="Top 8">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.estadosData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="estado" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total" name="Processos" radius={[4,4,0,0]}>
                    {stats.estadosData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      ) : null}
    </Layout>
  )
}
