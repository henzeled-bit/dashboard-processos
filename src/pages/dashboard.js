import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

function fmtMoney(v) {
  if (!v) return 'R$ 0'
  if (v >= 1e9) return `R$ ${(v/1e9).toFixed(1)}B`
  if (v >= 1e6) return `R$ ${(v/1e6).toFixed(1)}M`
  if (v >= 1e3) return `R$ ${(v/1e3).toFixed(0)}K`
  return `R$ ${v.toLocaleString('pt-BR', {minimumFractionDigits:0, maximumFractionDigits:0})}`
}

function fmtDias(d) {
  if (!d) return '-'
  if (d >= 365) {
    const anos = Math.floor(d / 365)
    const meses = Math.round((d % 365) / 30)
    return meses > 0 ? `${anos}a ${meses}m` : `${anos}a`
  }
  if (d >= 30) {
    const meses = Math.floor(d / 30)
    const dias = d % 30
    return dias > 0 ? `${meses}m ${dias}d` : `${meses}m`
  }
  return `${d}d`
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
  const [stats, setStats] = useState(null)
  const [anos, setAnos] = useState([])
  const [equipes, setEquipes] = useState([])
  const [fetching, setFetching] = useState(true)
  const [cacheAge, setCacheAge] = useState(null)

  useEffect(() => { if (!loading && !user) router.push('/') }, [user, loading])
  useEffect(() => { if (user) loadMeta() }, [user])
  useEffect(() => { if (anos.length > 0) loadStats() }, [filtroEquipe, filtroAno, anos])

  const loadMeta = async () => {
    const { data } = await supabase.from('dashboard_cache').select('data,updated_at').eq('id', 'meta').single()
    if (data) {
      setAnos(data.data.anos || [])
      setEquipes(data.data.equipes || [])
      setCacheAge(data.updated_at)
    } else {
      setFetching(false)
    }
  }

  const loadStats = async () => {
    setFetching(true)
    const cacheKey = `stats_${filtroEquipe}_${filtroAno}`
    const { data } = await supabase.from('dashboard_cache').select('data').eq('id', cacheKey).single()
    if (data) {
      setStats(data.data)
    } else {
      setStats(null)
    }
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
        {cacheAge && (
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginLeft: 'auto' }}>
            📊 Cache: {new Date(cacheAge).toLocaleString('pt-BR')}
          </span>
        )}
        {filtroAno !== 'Todos' && (
          <span style={{ color: '#f59e0b', fontSize: '12px', background: 'rgba(245,158,11,0.1)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.2)' }}>
            📅 {subtitulo}
          </span>
        )}
      </div>

      {fetching ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'rgba(255,255,255,0.4)' }}>⏳ Carregando...</div>
      ) : !stats ? (
        <div style={{ textAlign: 'center', padding: '80px' }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '16px', marginBottom: '16px' }}>
            ⚠️ Cache não encontrado. Vá em Configurações e clique em <strong style={{ color: '#60a5fa' }}>Recalcular Cache</strong>.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <StatCard title="Processos Ativos" value={stats.ativos.toLocaleString('pt-BR')} subtitle="sem data de encerramento" icon="🟢" color="#10b981" />
            <StatCard title={filtroAno !== 'Todos' ? `Cadastros em ${filtroAno}` : 'Cadastros'} value={stats.cadastros.toLocaleString('pt-BR')} subtitle={subtitulo} icon="📥" color="#3b82f6" />
            <StatCard title={filtroAno !== 'Todos' ? `Encerrados em ${filtroAno}` : 'Encerrados'} value={stats.encerrados.toLocaleString('pt-BR')} subtitle={subtitulo} icon="✅" color="#8b5cf6" />
            <StatCard title="Dentro do Prazo de Remuneração (30d)" value={`${stats.pctDentro}%`} subtitle={`${stats.dentroPrazo} de ${stats.comPrazo} encerramentos`} icon="⏱️" color={stats.pctDentro >= 80 ? '#10b981' : '#ef4444'} />
            <StatCard title="Valor da Carteira Ativa" value={fmtMoney(stats.valorTotal)} subtitle={`Média por processo ativo: ${fmtMoney(stats.valorMedio)}`} icon="💰" color="#f59e0b" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            {/* Card Cad→Ajuiz: só para equipe Ativas */}
            {filtroEquipe === 'Ativas' && (
              <StatCard
                title="Tempo Médio Cad→Ajuiz"
                value={fmtDias(stats.tempoCadAjuiz)}
                subtitle={`Processos que ajuizamos · ${stats.pctNosAjuizamos ?? 0}% do total (${(stats.nosAjuizamosCount || 0).toLocaleString('pt-BR')} proc.)`}
                icon="⚖️"
                color="#10b981"
              />
            )}
            {/* Card Ajuiz→Cad: para todas as equipes */}
            <StatCard
              title="Tempo Médio Ajuiz→Cad"
              value={fmtDias(stats.tempoAjuizCad)}
              subtitle={`Recebidos em andamento · ${stats.pctRecebidosAndamento ?? 0}% do total (${(stats.recebidosAndamentoCount || 0).toLocaleString('pt-BR')} proc.)`}
              icon="📋"
              color="#06b6d4"
            />
            <StatCard title="Tempo Médio Cad→Enc" value={fmtDias(stats.tempoCadEnc)} subtitle="entre cadastro e encerramento PGJ" icon="📅" color="#ec4899" />
            <StatCard title="Tempo Médio Ajuiz→Enc" value={fmtDias(stats.tempoAjuizEnc)} subtitle="entre ajuizamento e encerramento" icon="📆" color="#f59e0b" />
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
              {stats.prazoEquipeData?.length > 0 ? (
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
            <ChartCard title="Motivos de Encerramento" subtitle="Top 8">
              {stats.motivosData?.length > 0 ? (
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
                    {stats.estadosData?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </Layout>
  )
}
