import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { detectColumns, normalizeRow, parseDate, calculateTeam } from '../lib/columnMapper'
import * as XLSX from 'xlsx'
import { buildAndSaveCache } from '../lib/cacheBuilder'

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
  const [progress, setProgress] = useState(null)
  const [importHistory, setImportHistory] = useState([])
  const [newRule, setNewRule] = useState({ team_name: '', rule_type: 'lawyer', rule_value: '' })
  const [users, setUsers] = useState([])
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' })
  const [msg, setMsg] = useState('')
  const [cacheMsg, setCacheMsg] = useState('')
  const [buildingCache, setBuildingCache] = useState(false)

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

      // XLSX lê tanto .xlsx quanto .csv com qualquer encoding e separador
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      if (raw.length < 2) {
        setImportLog({ error: 'Arquivo vazio ou sem dados.' })
        setImporting(false)
        return
      }

      const headerIdx = findHeaderRow(raw)
      const headers = raw[headerIdx].map(h => h?.toString().trim())
      const columnMapping = detectColumns(headers)

      if (!columnMapping.processid) {
        setImportLog({ error: `Coluna "Id do Processo" não encontrada. Colunas detectadas: ${headers.filter(Boolean).slice(0, 8).join(', ')}` })
        setImporting(false)
        return
      }

      const { data: rules } = await supabase.from('team_rules').select('*').eq('active', true)
      const rows = raw.slice(headerIdx + 1).filter(r => r.some(c => c !== ''))
      const total = rows.length
      const BATCH = 100

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const records = []

        for (const row of batch) {
          const obj = {}
          headers.forEach((h, idx) => { obj[h] = row[idx] })
          const norm = normalizeRow(obj, columnMapping)
          if (!norm.processid) continue
          const teamCheck = calculateTeam({ namelawyer: norm.namelawyer, namearea: norm.namearea }, rules || [])
          if (!teamCheck) continue // sem equipe = ignora

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
          // Só envia campos preenchidos para não sobrescrever dados existentes com vazio
          const safeRecords = records.map(rec => {
            const r = { processid: rec.processid, updated_at: rec.updated_at }
            if (rec.createdate) r.createdate = rec.createdate
            if (rec.distributiondate) r.distributiondate = rec.distributiondate
            if (rec.closedatepartial) r.closedatepartial = rec.closedatepartial
            if (rec.closedate) r.closedate = rec.closedate
            if (rec.closereason) r.closereason = rec.closereason
            if (rec.namearea) r.namearea = rec.namearea
            if (rec.namelawyer) r.namelawyer = rec.namelawyer
            if (rec.namestate) r.namestate = rec.namestate
            if (rec.nameactiontype) r.nameactiontype = rec.nameactiontype
            if (rec.totalvalue !== null && rec.totalvalue !== undefined) r.totalvalue = rec.totalvalue
            if (rec.team) r.team = rec.team
            return r
          })
          await supabase.from('processos').upsert(safeRecords, { onConflict: 'processid' })
        }

        const current = Math.min(i + BATCH, total)
        setProgress({ current, total, pct: Math.round((current / total) * 100) })
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      await supabase.from('import_history').insert({
        filename: file.name,
        total_rows: total,
        new_records: 0,
        updated_records: 0,
        imported_by: user.email
      })

      setImportLog({ success: true, filename: file.name, total })
      fetchHistory()
      // Recalcula cache automaticamente após importação
      setBuildingCache(true)
      setCacheMsg('Recalculando cache do dashboard...')
      buildAndSaveCache((msg) => setCacheMsg(msg)).then(() => setBuildingCache(false)).catch(() => setBuildingCache(false))
    } catch (err) {
      setImportLog({ error: `Erro ao processar: ${err.message}` })
    }

    setImporting(false)
    setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const recalcularCache = async () => {
    setBuildingCache(true)
    setCacheMsg('Iniciando...')
    try {
      await buildAndSaveCache((msg) => setCacheMsg(msg))
    } catch (err) {
      setCacheMsg('Erro: ' + err.message)
    }
    setBuildingCache(false)
  }

  const [importandoHonorarios, setImportandoHonorarios] = useState(false)
  const [progressHon, setProgressHon] = useState(null)
  const [logHon, setLogHon] = useState(null)
  const fileHonRef = useRef()

  const handleHonorariosImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportandoHonorarios(true)
    setLogHon(null)
    setProgressHon(null)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
      // Usa aba '1º Quadrimestre' ou a primeira disponível
      const abaNome = wb.SheetNames.find(n => n.includes('Quadrimestre') || n.includes('quadrimestre')) || wb.SheetNames[0]
      const ws = wb.Sheets[abaNome]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      if (raw.length < 2) { setLogHon({ error: 'Arquivo vazio.' }); setImportandoHonorarios(false); return }

      const headers = raw[0].map(h => h?.toString().trim().toUpperCase())
      const col = (name) => headers.findIndex(h => h.includes(name))

      const idxProcessid = col('ID DO PROCESSO')
      const idxFase = col('FASE PROCESSUAL')
      const idxValor = col('VALOR')
      const idxDataAto = col('DATA DO ATO')
      const idxDataEnvio = col('DATA DE ENVIO')
      const idxDataAutorizacao = col('DATA APROVAÇÃO') !== -1 ? col('DATA APROVAÇÃO') : col('DATA APROV')

      if (idxProcessid === -1 || idxValor === -1) {
        setLogHon({ error: 'Colunas obrigatórias não encontradas (ID DO PROCESSO, VALOR).' })
        setImportandoHonorarios(false)
        return
      }

      const parseDate = (v) => {
        if (!v) return null
        if (typeof v === 'number') return new Date((v - 25569) * 86400 * 1000).toISOString().split('T')[0]
        if (v instanceof Date) return v.toISOString().split('T')[0]
        const s = v.toString().trim()
        if (!s || s.toLowerCase() === 'null') return null
        const parts = s.split('/')
        if (parts.length === 3) { const [d,m,y] = parts; return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` }
        const d = new Date(s)
        if (!isNaN(d)) return d.toISOString().split('T')[0]
        return null
      }

      const rows = raw.slice(1).filter(r => r[idxProcessid] && r[idxValor])
      const total = rows.length
      const BATCH = 100

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const records = batch.map(row => ({
          processid: row[idxProcessid]?.toString().trim(),
          fase: idxFase !== -1 ? (row[idxFase]?.toString().trim() || null) : null,
          valor: parseFloat(row[idxValor]?.toString().replace(',', '.')) || null,
          data_ato: idxDataAto !== -1 ? parseDate(row[idxDataAto]) : null,
          data_envio_pedido: idxDataEnvio !== -1 ? parseDate(row[idxDataEnvio]) : null,
          data_autorizacao: idxDataAutorizacao !== -1 ? parseDate(row[idxDataAutorizacao]) : null,
        })).filter(r => r.processid && r.valor)

        if (records.length > 0) {
          await supabase.from('honorarios').insert(records)
        }

        const current = Math.min(i + BATCH, total)
        setProgressHon({ current, total, pct: Math.round(current / total * 100) })
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      setLogHon({ success: true, filename: file.name, total })
    } catch(err) {
      setLogHon({ error: `Erro: ${err.message}` })
    }
    setImportandoHonorarios(false)
    setProgressHon(null)
    if (fileHonRef.current) fileHonRef.current.value = ''
  }

  const addRule = async () => {
    if (!newRule.team_name || !newRule.rule_value) return
    await supabase.from('team_rules').insert({ ...newRule, priority: newRule.rule_type === 'lawyer' ? 1 : 2, active: true })
    setNewRule({ team_name: '', rule_type: 'lawyer', rule_value: '' })
    fetchTeamRules()
  }
  const toggleRule = async (id, active) => {
    await supabase.from('team_rules').update({ active: !active }).eq('id', id)
    fetchTeamRules()
  }
  const deleteRule = async (id) => {
    await supabase.from('team_rules').delete().eq('id', id)
    fetchTeamRules()
  }

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
    await supabase.from('users').delete().eq('id', id)
    fetchUsers()
  }

  const inputStyle = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', padding: '9px 14px', fontSize: '14px', outline: 'none', flex: 1 }
  const btnPrimary = { background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', border: 'none', borderRadius: '8px', color: '#fff', padding: '9px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }
  const btnDanger = { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: '#fca5a5', padding: '5px 12px', fontSize: '12px', cursor: 'pointer' }

  if (loading) return null

  return (
    <Layout activeTab="config">

      <Section title="📥 Importar Planilha">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} disabled={importing} style={{ display: 'none' }} id="fileInput" />
          <label htmlFor="fileInput" style={{ ...btnPrimary, opacity: importing ? 0.5 : 1, cursor: importing ? 'not-allowed' : 'pointer', display: 'inline-block' }}>
            {importing ? '⏳ Importando...' : '📂 Selecionar Arquivo'}
          </label>
        </div>

        {progress && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
                Processando {progress.current.toLocaleString('pt-BR')} de {progress.total.toLocaleString('pt-BR')} registros
              </span>
              <span style={{ color: '#60a5fa', fontSize: '13px', fontWeight: '600' }}>{progress.pct}%</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '8px', height: '10px', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '8px', background: 'linear-gradient(90deg, #3b82f6, #10b981)', width: `${progress.pct}%`, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        {importLog && (
          <div style={{ marginTop: '16px', padding: '16px', background: importLog.error ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: `1px solid ${importLog.error ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, borderRadius: '8px' }}>
            {importLog.error
              ? <p style={{ color: '#fca5a5', margin: 0 }}>❌ {importLog.error}</p>
              : <p style={{ color: '#6ee7b7', margin: 0, fontWeight: '600' }}>✅ Concluído — {importLog.filename} — {importLog.total.toLocaleString('pt-BR')} registros processados</p>
            }
          </div>
        )}

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

      <Section title="💵 Importar Honorários" subtitle="Importe a planilha de atos aprovados. Cada linha será salva como um honorário vinculado ao ID do processo.">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileHonRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleHonorariosImport} disabled={importandoHonorarios} style={{ display: 'none' }} id="fileHonInput" />
          <label htmlFor="fileHonInput" style={{ ...btnPrimary, opacity: importandoHonorarios ? 0.5 : 1, cursor: importandoHonorarios ? 'not-allowed' : 'pointer', display: 'inline-block', background: 'linear-gradient(135deg, #10b981, #047857)' }}>
            {importandoHonorarios ? '⏳ Importando...' : '💵 Selecionar Planilha de Honorários'}
          </label>
        </div>

        {progressHon && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
                Processando {progressHon.current.toLocaleString('pt-BR')} de {progressHon.total.toLocaleString('pt-BR')} registros
              </span>
              <span style={{ color: '#6ee7b7', fontSize: '13px', fontWeight: '600' }}>{progressHon.pct}%</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '8px', height: '10px', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '8px', background: 'linear-gradient(90deg, #10b981, #06b6d4)', width: `${progressHon.pct}%`, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        {logHon && (
          <div style={{ marginTop: '16px', padding: '16px', background: logHon.error ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: `1px solid ${logHon.error ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, borderRadius: '8px' }}>
            {logHon.error
              ? <p style={{ color: '#fca5a5', margin: 0 }}>❌ {logHon.error}</p>
              : <p style={{ color: '#6ee7b7', margin: 0, fontWeight: '600' }}>✅ {logHon.total.toLocaleString('pt-BR')} honorários importados de {logHon.filename}</p>
            }
          </div>
        )}
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginTop: '12px' }}>
          ⚠️ Cada importação adiciona registros — não substitui. Para reimportar, limpe a tabela antes no Supabase.
        </p>
      </Section>

      <Section title="⚡ Cache do Dashboard" subtitle="O cache é atualizado automaticamente após cada importação. Use o botão abaixo para recalcular manualmente se necessário.">
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={recalcularCache}
            disabled={buildingCache}
            style={{ ...btnPrimary, opacity: buildingCache ? 0.6 : 1, cursor: buildingCache ? 'not-allowed' : 'pointer' }}
          >
            {buildingCache ? '⏳ Calculando...' : '🔄 Recalcular Cache'}
          </button>
          {cacheMsg && (
            <span style={{ color: cacheMsg.includes('✅') ? '#6ee7b7' : cacheMsg.includes('Erro') ? '#fca5a5' : 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
              {cacheMsg}
            </span>
          )}
        </div>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginTop: '12px' }}>
          ⚠️ O cálculo pode levar alguns minutos dependendo do volume de dados. Não feche a aba.
        </p>
      </Section>

      <Section title="👥 Regras de Equipes" subtitle="Advogados têm prioridade sobre a área. Ex: Administrativo = Passivas. Trabalhista e Tributário são ignorados.">
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
