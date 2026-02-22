import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { daysDiff } from '../lib/columnMapper'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']
const TEAM_COLORS = {
  'Ativas': '#3b82f6',
  'Superendividamento': '#10b981',
  'Imobiliário': '#f59e0b',
  'Planos': '#8b5cf6',
  'RJ': '#ef4444',
  'Sem Equipe': '#6b7280'
}

function StatCard({ title, value, subtitle, icon, color = '#3b82f6' }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
        background: `linear-gradient(90deg, ${color}, transparent)`
      }} />
      <div style={{ fontSize: '24px', marginBottom: '12px' }}>{icon}</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {title}
      </div>
      <div style={{ color: '#fff', fontSize: '32px', fontWeight: '700', letterSpacing: '-1px' }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', marginTop: '6px' }}>
          {subtitle}
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, children, subtitle }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding: '24px'
    }}>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: '600', margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginTop: '4px' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '8px', padding: '12px 16px'
      }}>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '8px' }}>{label}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ color: entry.color, fontSize: '14px', fontWeight: '600' }}>
            {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString('pt-BR') : entry.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [processos, setProcessos] = useState([])
  const [fetching, setFetching] = useState(true)
  const [filtroEquipe, setFiltroEquipe] = useState('Todas')
  const [filtroTipo, setFiltroTipo] = useState('cadastro') // 'cadastro' ou 'encerramento'
  const [filtroAno, setFiltroAno] = useState('Todos')

  useEffect(() => {
    if (!loading && !user) router.push('/')
  }, [user, loading])

  useEffect(() => {
    if (user) fetchData()
  }, [user])

  const fetchData = async () => {
    setFetching(true)
    const { data } = await supabase.from('processos').select('*')
    setProcessos(data || [])
    setFetching(false)
  }

  if (loading || fetching) {
    return (
      <Layout activeTab="dashboard">
        <div style={{ textAlign: 'center', padding: '80px', color: 'rgba(255,255,255,0.4)' }}>
          Carregando dados...
        </div>
      </Layout>
    )
  }

  // Anos disponíveis — pega de cadastro E encerramento
  const anosSet = new Set()
  processos.forEach(p => {
    if (p.createdate) anosSet.add(p.createdate.substring(0, 4))
    if (p.closedate) anosSet.add(p.closedate.substring(0, 4))
  })
  const anos = [...anosSet].sort().reverse()

  const equipes = [...new Set(processos.map(p => p.team).filter(Boolean))].sort()

  // Filtro por equipe
  let filtered = filtroEquipe !== 'Todas'
    ? processos.filter(p => p.team === filtroEquipe)
    : processos

  // Filtro por ano — usa o campo escolhido (cadastro ou encerramento)
  if (filtroAno !== 'Todos') {
    if (filtroTipo === 'cadastro') {
      filtered = filtered.filter(p => p.createdate?.startsWith(filtroAno))
    } else {
      filtered = filtered.filter(p => p.closedate?.startsWith(filtroAno))
    }
  }

  // ---- MÉTRICAS GERAIS ----
  const total = filtered.length
  const ativos = filtered.filter(p => !p.closedate).length
  const encerrados = filtered.filter(p => p.closedate).length
  const totalValue = filtered.reduce((sum, p) => sum + (parseFloat(p.totalvalue) || 0), 0)

  // ---- PRAZO 30 DIAS ----
  const comEncerramento = filtered.filter(p => p.closedatepartial && p.closedate)
  const dentroPrazo = comEncerramento.filter(p => {
    const diff = daysDiff(p.closedatepartial, p.closedate)
    return diff !== null && diff <= 30
  })
  const pctDentro = comEncerramento.length > 0
    ? Math.round((dentroPrazo.length / comEncerramento.length) * 100)
    : 0

  // ---- CADASTROS vs ENCERRAMENTOS por MÊS ----
  const mesesMap = {}
  filtered.forEach(p => {
    if (p.createdate) {
      const mes = p.createdate.substring(0, 7)
      if (!mesesMap[mes]) mesesMap[mes] = { mes, Cadastros: 0, Encerramentos: 0 }
      mesesMap[mes].Cadastros++
    }
    if (p.closedate) {
      const mes = p.closedate.substring(0, 7)
      if (!mesesMap[mes]) mesesMap[mes] = { mes, Cadastros: 0, Encerramentos: 0 }
      mesesMap[mes].Encerramentos++
    }
  })
  const mesesData = Object.values(mesesMap)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(-18)
    .map(d => ({ ...d, mes: d.mes.replace('-', '/') }))

  // ---- POR EQUIPE ----
  const equipesMap = {}
  filtered.forEach(p => {
    const eq = p.team || 'Sem Equipe'
    if (!equipesMap[eq]) equipesMap[eq] = { equipe: eq, Total: 0, Ativos: 0, Encerrados: 0, Valor: 0 }
    equipesMap[eq].Total++
    if (p.closedate) equipesMap[eq].Encerrados++
    else equipesMap[eq].Ativos++
    equipesMap[eq].Valor += parseFloat(p.totalvalue) || 0
  })
  const equipesData = Object.values(equipesMap)

  // ---- PRAZO POR EQUIPE ----
  const prazoPorEquipe = {}
  filtered.filter(p => p.closedatepartial && p.closedate).forEach(p => {
    const eq = p.team || 'Sem Equipe'
    if (!prazoPorEquipe[eq]) prazoPorEquipe[eq] = { equipe: eq, dentro: 0, fora: 0 }
    const diff = daysDiff(p.closedatepartial, p.closedate)
    if (diff <= 30) prazoPorEquipe[eq].dentro++
    else prazoPorEquipe[eq].fora++
  })
  const prazoEquipeData = Object.values(prazoPorEquipe).map(d => ({
    ...d,
    'Dentro do Prazo': d.dentro,
    'Fora do Prazo': d.fora,
  }))

  // ---- MOTIVOS DE ENCERRAMENTO ----
  const motivosMap = {}
  filtered.filter(p => p.closereason).forEach(p => {
    motivosMap[p.closereason] = (motivosMap[p.closereason] || 0) + 1
  })
  const motivosData = Object.entries(motivosMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  // ---- ESTADOS ----
  const estadosMap = {}
  filtered.forEach(p => {
    if (p.namestate) estadosMap[p.namestate] = (estadosMap[p.namestate] || 0) + 1
  })
  const estadosData = Object.entries(estadosMap)
    .map(([estado, total]) => ({ estado, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  // ---- TEMPO MÉDIO ----
  const tempoMedioCadAjuiz = (() => {
    const validos = filtered.filter(p => p.createdate && p.distributiondate)
    if (!validos.length) return null
    const media = validos.reduce((s, p) => s + Math.abs(daysDiff(p.createdate, p.distributiondate) || 0), 0) / validos.length
    return Math.round(media)
  })()

  const tempoMedioAjuizEnc = (() => {
    const validos = filtered.filter(p => p.distributiondate && p.closedate)
    if (!validos.length) return null
    const media = validos.reduce((s, p) => s + Math.abs(daysDiff(p.distributiondate, p.closedate) || 0), 0) / validos.length
    return Math.round(media)
  })()

  // ---- ESTOQUE ATIVO ----
  const estoqueMap = {}
  processos.forEach(p => { // usa todos, não filtrado
    if (p.createdate) {
      const m = p.createdate.substring(0, 7)
      estoqueMap[m] = estoqueMap[m] || { entradas: 0, saidas: 0 }
      estoqueMap[m].entradas++
    }
    if (p.closedate) {
      const m = p.closedate.substring(0, 7)
      estoqueMap[m] = estoqueMap[m] || { entradas: 0, saidas: 0 }
      estoqueMap[m].saidas++
    }
  })
  let estoque = 0
  const estoqueData = Object.keys(estoqueMap).sort().slice(-18).map(mes => {
    estoque += estoqueMap[mes].entradas - estoqueMap[mes].saidas
    return { mes: mes.replace('-', '/'), 'Estoque Ativo': Math.max(0, estoque) }
  })

  const filterStyle = {
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px', color: '#fff', padding: '8px 14px', fontSize: '13px', cursor: 'pointer'
  }

  const labelFiltro = filtroTipo === 'cadastro'
    ? 'Filtrando por ano de cadastro'
    : 'Filtrando por ano de encerramento'

  return (
    <Layout activeTab="dashboard">
      {/* Filtros */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Filtrar por:</span>

        <select value={filtroEquipe} onChange={e => setFiltroEquipe(e.target.value)} style={filterStyle}>
          <option value="Todas">Todas as Equipes</option>
          {equipes.map(e => <option key={e} value={e}>{e}</option>)}
        </select>

        {/* Seletor do tipo de ano */}
        <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setFiltroAno('Todos') }} style={filterStyle}>
          <option value="cadastro">Ano de Cadastro</option>
          <option value="encerramento">Ano de Encerramento</option>
        </select>

        <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)} style={filterStyle}>
          <option value="Todos">Todos os Anos</option>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <button onClick={fetchData} style={{
          ...filterStyle,
          background: 'rgba(59,130,246,0.15)',
          border: '1px solid rgba(59,130,246,0.3)',
          color: '#60a5fa'
        }}>
          🔄 Atualizar
        </button>

        {filtroAno !== 'Todos' && (
          <span style={{ color: '#f59e0b', fontSize: '12px', background: 'rgba(245,158,11,0.1)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.2)' }}>
            📅 {labelFiltro}: {filtroAno}
          </span>
        )}

        {processos.length === 0 && (
          <span style={{ color: '#f59e0b', fontSize: '13px' }}>
            ⚠️ Nenhum dado importado ainda. Vá em Configurações para importar uma planilha.
          </span>
        )}
      </div>

      {/* Cards de métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <StatCard title="Total de Processos" value={total.toLocaleString('pt-BR')} icon="📁" color="#3b82f6" />
        <StatCard title="Processos Ativos" value={ativos.toLocaleString('pt-BR')} subtitle={`${total > 0 ? Math.round(ativos/total*100) : 0}% do total`} icon="🟢" color="#10b981" />
        <StatCard title="Encerrados" value={encerrados.toLocaleString('pt-BR')} subtitle={`${total > 0 ? Math.round(encerrados/total*100) : 0}% do total`} icon="✅" color="#8b5cf6" />
        <StatCard title="Dentro do Prazo (30d)" value={`${pctDentro}%`} subtitle={`${dentroPrazo.length} de ${comEncerramento.length} encerramentos`} icon="⏱️" color={pctDentro >= 80 ? '#10b981' : '#ef4444'} />
        <StatCard title="Valor Total" value={`R$ ${(totalValue/1000000).toFixed(1)}M`} subtitle={`${total} processos`} icon="💰" color="#f59e0b" />
        <StatCard title="Tempo Médio Cad→Ajuiz" value={tempoMedioCadAjuiz ? `${tempoMedioCadAjuiz}d` : '-'} subtitle="dias entre cadastro e ajuizamento" icon="📅" color="#06b6d4" />
        <StatCard title="Tempo Médio Ajuiz→Enc" value={tempoMedioAjuizEnc ? `${tempoMedioAjuizEnc}d` : '-'} subtitle="dias entre ajuizamento e encerramento" icon="📆" color="#ec4899" />
      </div>

      {/* Linha 1: Cadastros vs Encerramentos + Estoque */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <ChartCard title="Cadastros vs Encerramentos" subtitle="Por mês (últimos 18 meses)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={mesesData}>
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

        <ChartCard title="Evolução do Estoque Ativo" subtitle="Total de processos sem encerramento (base completa)">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={estoqueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="mes" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="Estoque Ativo" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Linha 2: Por equipe + Prazo por equipe */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <ChartCard title="Processos por Equipe" subtitle="Ativos e encerrados">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={equipesData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
              <YAxis dataKey="equipe" type="category" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} width={120} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }} />
              <Bar dataKey="Ativos" fill="#3b82f6" stackId="a" />
              <Bar dataKey="Encerrados" fill="#10b981" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Prazo de Encerramento por Equipe" subtitle="Dentro vs fora dos 30 dias (TJ → PGJ)">
          {prazoEquipeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={prazoEquipeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <YAxis dataKey="equipe" type="category" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} width={120} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }} />
                <Bar dataKey="Dentro do Prazo" fill="#10b981" stackId="b" />
                <Bar dataKey="Fora do Prazo" fill="#ef4444" stackId="b" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.25)', fontSize: '14px' }}>
              Sem dados de encerramento para exibir
            </div>
          )}
        </ChartCard>
      </div>

      {/* Linha 3: Motivos + Estados + Valor por equipe */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <ChartCard title="Motivos de Encerramento" subtitle="Top 8">
          {motivosData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={motivosData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} width={110} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Processos" radius={[0,4,4,0]}>
                  {motivosData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.25)', fontSize: '14px' }}>
              Sem encerramentos no período
            </div>
          )}
        </ChartCard>

        <ChartCard title="Processos por Estado" subtitle="Top 8 estados">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={estadosData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="estado" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Processos" radius={[4,4,0,0]}>
                {estadosData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Valor por Equipe" subtitle="Soma do valor da causa">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={equipesData.filter(d => d.Valor > 0)}
                dataKey="Valor"
                nameKey="equipe"
                cx="50%" cy="50%"
                outerRadius={85}
                label={({ equipe, percent }) => percent > 0.05 ? `${equipe} ${(percent*100).toFixed(0)}%` : ''}
              >
                {equipesData.map((entry, i) => (
                  <Cell key={i} fill={TEAM_COLORS[entry.equipe] || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `R$ ${v.toLocaleString('pt-BR', {minimumFractionDigits:2})}`} content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </Layout>
  )
}
