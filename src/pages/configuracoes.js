import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { detectColumns, normalizeRow, parseDate, calculateTeam } from '../lib/columnMapper'
import * as XLSX from 'xlsx'

function Section({ title, subtitle, children }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '28px', marginBottom: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: '600', margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginTop: '6px' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue
    const rowStr = row.map(c => c?.toString().toLowerCase().trim()).join(' ')
    if (rowStr.includes('id do processo') || rowStr.includes('processid') || rowStr.includes('data cadastramento') || rowStr.includes('createdate')) {
      return i
    }
  }
  return 0
}

export default function ConfiguracoesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const fileRef = useRef()

  const [teamRules, setTeamRules] = useState([])
  const [importLog, setImportLog] = useState(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(null) // { current, total, pct }
  const [importHistory, setImportHistory] = useState([])
  const [newRule, setNewRule] = useState({ team_name: '', rule_type: 'lawyer', rule_value: '' })
  const [users, setUsers] = useState([])
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' })
  const [msg, setMsg] = useState('')

  useEffect(() => { if (!loading && !user) router.push('/') }, [user, loading])
  useEffect(() => { if (user) { fetchTeamRules(); fetchHistory(); fetchUsers() } }, [user])

  const fetchTeamRules = async () => {
    const { data } = await supabase.from('team_rules').select('*').order('priority').order('team_name')
    setTeamRules(data || [])
  }
  const fetchHistory = async () => {
    const { data } = await supabase.from('import_history').select('*').order('imported_at', { ascending: false }).limit(10)
    setImportHistory(data || [])
  }
  const fetchUsers = async () => {
    const { data } = await supabase.from('users').select('id, name, email, created_at')
    setUsers(data || [])
  }

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportLog(null)
    setProgress(null)

    try {
      const buffer = await file.arrayBuffer()
      let raw = []

      if (file.name.toLowerCase().endsWith('.csv')) {
        const decoder = new TextDecoder('iso-8859-1')
        const text = decoder.decode(buffer)
        const lines = text.split(/\r?\n/)
        raw = lines.map(line => {
          const sep = line.includes(';') ? ';' : ','
          return line.split(sep).map(cell => cell.replace(/^"(.*)"$/, '$1').trim())
        }).filter(row => row.some(c => c !== ''))
      } else {
        const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      }

      if (raw.length < 2) {
        setImportLog({ error: 'Arquivo vazio ou sem dados.' })
        setImporting(false)
        return
      }

      // Detecta linha de cabeçalho real
      const headerIdx = findHeaderRow(raw)
      const headers = raw[headerIdx].map(h => h?.toString().trim())
      const columnMapping = detectColumns(headers)

      if (!columnMapping.processid) {
        setImportLog({ error: `Coluna "Id do Processo" não encontrada. Colunas detectadas: ${headers.filter(Boolean).slice(0,8).join(', ')}` })
        setImporting(false)
        return
      }

      const { data: rules } = await supabase.from('team_rules').select('*').eq('active', true)
      const rows = raw.slice(headerIdx + 1).filter(r => r.some(c => c !== ''))
      const total = rows.length

      let newRecords = 0
      let updatedRecords = 0

      // Modo rápido: processa em lotes de 100 com upsert
      const BATCH = 100
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const records = []

        for (const row of batch) {
          const obj = {}
          headers.forEach((h, idx) => { obj[h] = row[idx] })
          const norm = normalizeRow(obj, columnMapping)
          if (!norm.processid) continue

          const processid = norm.processid.toString().trim()

          let totalvalue = null
          if (norm.totalvalue !== null && norm.totalvalue !== '') {
            const cleaned = norm.totalvalue.toString().replace(/[R$\s.]/g, '').replace(',', '.')
            totalvalue = parseFloat(cleaned) || null
          }

          const team = calculateTeam({ namelawyer: norm.namelawyer, namearea: norm.namearea }, rules || [])

          records.push({
            processid,
            createdate: parseDate(norm.createdate),
            distributiondate: parseDate(norm.distributiondate),
            closedatepartial: parseDate(norm.closedatepartial),
            closedate: parseDate(norm.closedate),
            closereason: norm.closereason || null,
            namearea: norm.namearea || null,
            namelawyer: norm.namelawyer || null,
            namestate: norm.namestate || null,
            nameactiontype: norm.nameactiontype || null,
            totalvalue,
            team,
            updated_at: new Date().toISOString()
          })
        }

        if (records.length > 0) {
          // Upsert em lote — muito mais rápido que um por um
          const { error } = await supabase
            .from('processos')
            .upsert(records, { onConflict: 'processid', ignoreDuplicates: false })

          if (!error) {
            newRecords += records.length // aproximado (upsert não distingue)
          }
        }

        // Atualiza progresso — await deixa o browser renderizar antes do próximo lote
        const current = Math.min(i + BATCH, total)
        setProgress({ current, total, pct: Math.round((current / total) * 100) })
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      await supabase.from('import_history').insert({
        filename: file.name,
        total_rows: total,
        new_records: newRecords,
        updated_records: updatedRecords,
        imported_by: user.email
      })

      setImportLog({ success: true, filename: file.name, total })
      fetchHistory()
    } catch (err) {
      setImportLog({ error: `Erro ao processar: ${err.message}` })
    }

    setImporting(false)
    setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const addRule = async () => {
    if (!newRule.team_name || !newRule.rule_value) return
    await supabase.from('team_rules').insert({ ...newRule, priority: newRule.rule_type === 'lawyer' ? 1 : 2, active: true })
    setNewRule({ team_name: '', rule_type: 'lawyer', rule_value: '' })
    fetchTeamRules()
  }
  const toggleRule = async (id, active) => { await supabase.from('team_rules').update({ active: !active }).eq('id', id); fetchTeamRules() }
  const deleteRule = async (id) => { await supabase.from('team_rules').delete().eq('id', id); fetchTeamRules() }

  const addUser = async () => {
    if (!newUser.email || !newUser.password) return
    const { error } = await supabase.from('users').insert(newUser)
    if (error) { setMsg('Erro: ' + error.message); return }
    setMsg('Usuário criado com sucesso!')
    setNewUser({ name: '', email: '', password: '' })
    fetchUsers()
    setTimeout(() => setMsg(''), 3000)
  }
  const deleteUser = async (id) => {
    if (id === user.id) { setMsg('Não é possível excluir o usuário logado.'); return }
    await supabase.from('users').delete().eq('id', id); fetchUsers()
  }

  const inputStyle = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', padding: '9px 14px', fontSize: '14px', outline: 'none', flex: 1 }
  const btnPrimary = { background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', border: 'none', borderRadius: '8px', color: '#fff', padding: '9px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }
  const btnDanger = { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: '#fca5a5', padding: '5px 12px', fontSize: '12px', cursor: 'pointer' }

  if (loading) return null

  return (
    <Layout activeTab="config">

      {/* IMPORTAÇÃO */}
      <Section title="📥 Importar Planilha">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} disabled={importing} style={{ display: 'none' }} id="fileInput" />
          <label htmlFor="fileInput" style={{ ...btnPrimary, opacity: importing ? 0.5 : 1, cursor: importing ? 'not-allowed' : 'pointer', display: 'inline-block' }}>
            {importing ? '⏳ Importando...' : '📂 Selecionar Arquivo'}
          </label>
        </div>

        {/* Barra de progresso */}
        {progress && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
                Processando linha {progress.current.toLocaleString('pt-BR')} de {progress.total.toLocaleString('pt-BR')}
              </span>
              <span style={{ color: '#60a5fa', fontSize: '13px', fontWeight: '600' }}>{progress.pct}%</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '8px', height: '10px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '8px',
                background: 'linear-gradient(90deg, #3b82f6, #10b981)',
                width: `${progress.pct}%`,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        )}

        {/* Resultado */}
        {importLog && (
          <div style={{ marginTop: '16px', padding: '16px', background: importLog.error ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: `1px solid ${importLog.error ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, borderRadius: '8px' }}>
            {importLog.error
              ? <p style={{ color: '#fca5a5', margin: 0 }}>❌ {importLog.error}</p>
              : <p style={{ color: '#6ee7b7', margin: 0, fontWeight: '600' }}>✅ Importação concluída — {importLog.filename} — {importLog.total.toLocaleString('pt-BR')} registros processados</p>
            }
          </div>
        )}

        {/* Histórico */}
        {importHistory.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '10px' }}>Últimas importações:</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Arquivo', 'Linhas', 'Importado por', 'Data'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.4)', textAlign: 'left', fontWeight: '500' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importHistory.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{h.filename}</td>
                    <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{h.total_rows?.toLocaleString('pt-BR')}</td>
                    <td style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>{h.imported_by}</td>
                    <td style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.4)' }}>{new Date(h.imported_at).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* REGRAS DE EQUIPE */}
      <Section title="👥 Regras de Equipes" subtitle="Advogados têm prioridade sobre a área. Área 'Administrativo' = Passivas. Áreas 'Trabalhista' e 'Tributário' são ignoradas.">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input placeholder="Nome da equipe (ex: Ativas)" value={newRule.team_name} onChange={e => setNewRule(r => ({ ...r, team_name: e.target.value }))} style={inputStyle} />
          <select value={newRule.rule_type} onChange={e => setNewRule(r => ({ ...r, rule_type: e.target.value }))} style={{ ...inputStyle, flex: 'none', width: '160px' }}>
            <option value="lawyer">Advogado</option>
            <option value="area">Área</option>
          </select>
          <input placeholder={newRule.rule_type === 'lawyer' ? 'Nome exato do advogado' : 'Nome exato da área'} value={newRule.rule_value} onChange={e => setNewRule(r => ({ ...r, rule_value: e.target.value }))} style={inputStyle} />
          <button onClick={addRule} style={btnPrimary}>+ Adicionar</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['Equipe', 'Tipo', 'Valor', 'Status', 'Ações'].map(h => (
                <th key={h} style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.4)', textAlign: 'left', fontWeight: '500', fontSize: '12px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teamRules.map(rule => (
              <tr key={rule.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: rule.active ? 1 : 0.4 }}>
                <td style={{ padding: '10px 12px', color: '#fff', fontWeight: '600' }}>{rule.team_name}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', background: rule.rule_type === 'lawyer' ? 'rgba(139,92,246,0.2)' : 'rgba(59,130,246,0.2)', color: rule.rule_type === 'lawyer' ? '#c4b5fd' : '#93c5fd' }}>
                    {rule.rule_type === 'lawyer' ? '👤 Advogado' : '🏢 Área'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{rule.rule_value}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', background: rule.active ? 'rgba(16,185,129,0.2)' : 'rgba(107,114,128,0.2)', color: rule.active ? '#6ee7b7' : '#9ca3af' }}>
                    {rule.active ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', display: 'flex', gap: '8px' }}>
                  <button onClick={() => toggleRule(rule.id, rule.active)} style={{ ...btnDanger, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd' }}>
                    {rule.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button onClick={() => deleteRule(rule.id)} style={btnDanger}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* USUÁRIOS */}
      <Section title="🔐 Usuários do Sistema">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input placeholder="Nome" value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} style={inputStyle} />
          <input placeholder="Email" type="email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} style={inputStyle} />
          <input placeholder="Senha" type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} style={inputStyle} />
          <button onClick={addUser} style={btnPrimary}>+ Adicionar</button>
        </div>
        {msg && (
          <div style={{ padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', background: msg.includes('Erro') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: msg.includes('Erro') ? '#fca5a5' : '#6ee7b7', border: `1px solid ${msg.includes('Erro') ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}` }}>{msg}</div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['Nome', 'Email', 'Criado em', 'Ação'].map(h => (
                <th key={h} style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.4)', textAlign: 'left', fontWeight: '500', fontSize: '12px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '10px 12px', color: '#fff' }}>{u.name || '—'}</td>
                <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{u.email}</td>
                <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
                <td style={{ padding: '10px 12px' }}>
                  {u.id !== user?.id && <button onClick={() => deleteUser(u.id)} style={btnDanger}>Excluir</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </Layout>
  )
}
