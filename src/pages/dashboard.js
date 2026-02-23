import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
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

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [filtroEquipe, setFiltroEquipe] = useState('Todas')
  const [filtroAno, setFiltroAno] = useState('Todos')
  const [fetching, setFetching] = useState(true)

  // Dados agregados — sem trazer registros individuais
  const [stats, setStats] = useState(null)
  const [anos, setAnos] = useState([])
  const [equipes, setEquipes] = useState([])

  useEffect(() => { if (!loading && !user) router.push('/') }, [user, loading])
  useEffect(() => { if (user) fetchAll() }, [user])
  useEffect(() => { if (user && !fetching) fetchStats() }, [filtroEquipe, filtroAno])

  const fetchAll = async () => {
    setFetching(true)
    await Promise.all([fetchAnos(), fetchEquipes(), fetchStats()])
    setFetching(false)
  }

  const fetchAnos = async () => {
    // Busca anos distintos de cadastro e encerramento
    const { data } = await supabase.rpc('get_anos_disponiveis')
    if (data) setAnos(data.map(r => r.ano).filter(Boolean).sort().reverse())
    else {
      // fallback: busca amostras
      const { data: d1 } = await supabase.from('processos').select('createdate').not('createdate', 'is', null).limit(1000)
      const { data: d2 } = await supabase.from('processos').select('closedate').not('closedate', 'is', null).limit(1000)
      const anosSet = new Set()
      ;(d1 || []).forEach(r => r.createdate && anosSet.add(r.createdate.substring(0, 4)))
      ;(d2 || []).forEach(r => r.closedate && anosSet.add(r.closedate.substring(0, 4)))
      setAnos([...anosSet].sort().reverse())
    }
  }

  const fetchEquipes = async () => {
    const { data } = await supabase.from('processos').select('team').not('team', 'is', null).limit(5000)
    const eq = [...new Set((data || []).map(r => r.team).filter(Boolean))].sort()
    setEquipes(eq)
  }

  const buildFilters = () => {
    let q = supabase.from('processos').select('*', { count: 'exact', head: true })
    if (filtroEquipe !== 'Todas') q = q.eq('team', filtroEquipe)
    return { equipe: filtroEquipe, ano: filtroAno }
  }

  const fetchStats = async () => {
    setFetching(true)
    try {
      const eqFilter = filtroEquipe !== 'Todas'
      const anoFilter = filtroAno !== 'Todos'

      // Busca contagens principais
      let qTotal = supabase.from('processos').select('*', { count: 'exact', head: true })
      if (eqFilter) qTotal = qTotal.eq('team', filtroEquipe)

      let qFiltro = supabase.from('processos').select('*', { count: 'exact', head: true })
      if (eqFilter) qFiltro = qFiltro.eq('team', filtroEquipe)
      if (anoFilter) qFiltro = qFiltro.or(`createdate.gte.${filtroAno}-01-01,closedate.gte.${filtroAno}-01-01`).or(`createdate.lte.${filtroAno}-12-31,closedate.lte.${filtroAno}-12-31`)

      // Busca uma amostra menor para calcular métricas (máx 3000 registros filtrados)
      let qSample = supabase.from('processos')
        .select('createdate,closedate,closedatepartial,distributiondate,team,namestate,closereason,totalvalue,namearea')
        .order('createdate', { ascending: false })
        .limit(3000)
      if (eqFilter) qSample = qSample.eq('team', filtroEquipe)
      if (anoFilter) {
        qSample = qSample.or(`createdate.gte.${filtroAno}-01-01,closedate.gte.${filtroAno}-01-01`)
      }

      const [{ count: totalBase }, { count: totalFiltro }, { data: sample }] = await Promise.all([
        qTotal,
        qFiltro,
        qSample
      ])

      const rows = sample || []

      // Filtra amostra pelo ano corretamente
      const filtered = anoFilter
        ? rows.filter(p => p.createdate?.startsWith(filtroAno) || p.closedate?.startsWith(filtroAno))
        : rows

      const encerrados = filtered.filter(p => p.closedate)
      const ativos = filtered.filter(p => !p.closedate)

      // Prazo 30 dias
      const comPrazo = encerrados.filter(p => p.closedatepartial && p.closedate)
      const dentroPrazo = comPrazo.filter(p => {
        const d1 = new Date(p.closedatepartial), d2 = new Date(p.closedate)
        return Math.round((d2 - d1) / 86400000) <= 30
      })
      const pctDentro = comPrazo.length > 0 ? Math.round(dentroPrazo.length / comPrazo.length * 100) : 0

      // Valor total
      const valorTotal = filtered.reduce((s, p) => s + (parseFloat(p.totalvalue) || 0), 0)

      // Cadastros vs encerramentos por mês
      const mesesMap = {}
      filtered.forEach(p => {
        if (p.createdate && (!anoFilter || p.createdate.startsWith(filtroAno))) {
          const m = p.createdate.substring(0, 7)
          mesesMap[m] = mesesMap[m] || { mes: m, Cadastros: 0, Encerramentos: 0 }
          mesesMap[m].Cadastros++
        }
        if (p.closedate && (!anoFilter || p.closedate.startsWith(filtroAno))) {
          const m = p.closedate.substring(0, 7)
          mesesMap[m] = mesesMap[m] || { mes: m, Cadastros: 0, Encerramentos: 0 }
          mesesMap[m].Encerramentos++
        }
      })
      const mesesData = Object.values(mesesMap).sort((a, b) => a.mes.localeCompare(b.mes))
        .map(d => ({ ...d, mes: d.mes.replace('-', '/') }))

      // Por equipe
      const equipesMap = {}
      filtered.forEach(p => {
        const eq = p.team || 'Sem Equipe'
        equipesMap[eq] = equipesMap[eq] || { equipe: eq, Ativos: 0, Encerrados: 0, Valor: 0 }
        if (p.closedate) equipesMap[eq].Encerrados++
        else equipesMap[eq].Ativos++
        equipesMap[eq].Valor += parseFloat(p.totalvalue) || 0
      })
      const equipesData = Object.values(equipesMap)

      // Prazo por equipe
      const prazoMap = {}
      encerrados.filter(p => p.closedatepartial).forEach(p => {
        const eq = p.team || 'Sem Equipe'
        prazoMap[eq] = prazoMap[eq] || { equipe: eq, 'Dentro do Prazo': 0, 'Fora do Prazo': 0 }
        const diff = Math.round((new Date(p.closedate) - new Date(p.closedatepartial)) / 86400000)
        if (diff <= 30) prazoMap[eq]['Dentro do Prazo']++
        else prazoMap[eq]['Fora do Prazo']++
      })
      const prazoEquipeData = Object.values(prazoMap)

      // Motivos
      const motivosMap = {}
      encerrados.filter(p => p.closereason).forEach(p => { motivosMap[p.closereason] = (motivosMap[p.closereason] || 0) + 1 })
      const motivosData = Object.entries(motivosMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)

      // Estados
      const estadosMap = {}
      filtered.forEach(p => { if (p.namestate) estadosMap[p.namestate] = (estadosMap[p.namestate] || 0) + 1 })
      const estadosData = Object.entries(estadosMap).map(([estado, total]) => ({ estado, total })).sort((a, b) => b.total - a.total).slice(0, 8)

      // Tempo médio
      const cadAjuiz = filtered.filter(p => p.createdate && p.distributiondate)
      const tempoCA = cadAjuiz.length > 0
        ? Math.round(cadAjuiz.reduce((s, p) => s + Math.abs(Math.round((new Date(p.distributiondate) - new Date(p.createdate)) / 86400000)), 0) / cadAjuiz.length)
        : null

      const ajuizEnc = encerrados.filter(p => p.distributiondate && p.closedate)
      const tempoAE = ajuizEnc.length > 0
        ? Math.round(ajuizEnc.reduce((s, p) => s + Math.abs(Math.round((new Date(p.closedate) - new Date(p.distributiondate)) / 86400000)), 0) / ajuizEnc.length)
        : null

      setStats({
        totalBase, totalFiltro: totalFiltro || filtered.length,
        ativos: ativos.length, encerrados: encerrados.length,
        pctDentro, dentroPrazo: dentroPrazo.length, comPrazo: comPrazo.length,
        valorTotal, tempoCA, tempoAE,
        mesesData, equipesData, prazoEquipeData, motivosData, estadosData
      })
    } catch (err) {
      console.error(err)
    }
    setFetching(false)
  }

  const filterStyle = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }
  const subtitulo = filtroAno !== 'Todos' ? `Cadastros e encerramentos de ${filtroAno}` : 'Todos os períodos'

  if (loading) return <Layout activeTab="dashboard"><div style={{ textAlign: 'center', padding: '80px', color: 'rgba(255,255,255,0.4)' }}>Carregando...</div></Layout>

  return (
    <Layout activeTab="dashboard">
      {/* Filtros */}
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
        <div style={{ textAlign: 'center', padding: '80px', color: 'rgba(255,255,255,0.4)' }}>
          ⏳ Calculando métricas...
        </div>
      ) : stats ? (
        <>
          {/* Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            <StatCard title="Total na Base" value={stats.totalBase?.toLocaleString('pt-BR') || '-'} subtitle="todos os processos importados" icon="📁" color="#3b82f6" />
            <StatCard title="Processos Ativos" value={stats.ativos.toLocaleString('pt-BR')} subtitle={`na amostra filtrada`} icon="🟢" color="#10b981" />
            <StatCard title={filtroAno !== 'Todos' ? `Encerrados em ${filtroAno}` : 'Encerrados'} value={stats.encerrados.toLocaleString('pt-BR')} icon="✅" color="#8b5cf6" />
            <StatCard title="Dentro do Prazo (30d)" value={`${stats.pctDentro}%`} subtitle={`${stats.dentroPrazo} de ${stats.comPrazo} encerramentos`} icon="⏱️" color={stats.pctDentro >= 80 ? '#10b981' : '#ef4444'} />
            <StatCard title="Valor Total" value={`R$ ${((stats.valorTotal || 0) / 1000000).toFixed(1)}M`} icon="💰" color="#f59e0b" />
            <StatCard title="Tempo Médio Cad→Ajuiz" value={stats.tempoCA ? `${stats.tempoCA}d` : '-'} subtitle="dias" icon="📅" color="#06b6d4" />
            <StatCard title="Tempo Médio Ajuiz→Enc" value={stats.tempoAE ? `${stats.tempoAE}d` : '-'} subtitle="dias" icon="📆" color="#ec4899" />
          </div>

          {/* Linha 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <ChartCard title="Cadastros vs Encerramentos" subtitle={subtitulo}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.mesesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="mes" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }} />
                  <Bar dataKey="Cadastros" fill="#3b82f6" radius={[4,4,0,0]} />
                  <Bar dataKey="Encerramentos" fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Processos por Equipe" subtitle="Ativos e encerrados na amostra">
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
          </div>

          {/* Linha 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
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

            <ChartCard title="Valor por Equipe" subtitle="Soma do valor da causa">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={stats.equipesData.filter(d => d.Valor > 0)} dataKey="Valor" nameKey="equipe" cx="50%" cy="50%" outerRadius={100}
                    label={({ equipe, percent }) => percent > 0.05 ? `${equipe} ${(percent * 100).toFixed(0)}%` : ''}>
                    {stats.equipesData.map((e, i) => <Cell key={i} fill={TEAM_COLORS[e.equipe] || COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Linha 3 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <ChartCard title="Motivos de Encerramento" subtitle="Top 8">
              {stats.motivosData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats.motivosData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} width={120} />
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
