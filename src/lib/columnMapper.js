export const COLUMN_MAP = {
  processid: ['processid', 'Id do Processo', 'id do processo', 'ID do Processo'],
  createdate: ['createdate', 'Data Cadastramento', 'Data de Cadastramento'],
  distributiondate: ['distributiondate', 'Data Ajuizamento', 'Data de Ajuizamento'],
  closedatepartial: ['closedatepartial', 'Data Encerramento Parcial'],
  closedate: ['closedate', 'Data Encerramento', 'Data de Encerramento'],
  closereason: ['closereason', 'Motivo Encerramento', 'Motivo do Encerramento'],
  namearea: ['namearea', 'Area', 'Área'],
  namelawyer: ['namelawyer', 'Advogado Responsavel Processo', 'Advogado Responsável Processo', 'Advogado'],
  namestate: ['namestate', 'Estado'],
  nameactiontype: ['nameactiontype', 'Tipo de Acao', 'Tipo de Ação'],
  totalvalue: ['totalvalue', 'Valor da Causa', 'Valor Causa'],
}

function normalize(s) {
  if (!s) return ''
  return s.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function detectColumns(headers) {
  const mapping = {}
  const headersNorm = headers.map(h => normalize(h))
  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    for (const alias of aliases) {
      const idx = headersNorm.findIndex(h => h === normalize(alias))
      if (idx !== -1) { mapping[field] = headers[idx]; break }
    }
  }
  return mapping
}

export function normalizeRow(row, columnMapping) {
  const normalized = {}
  for (const [field, excelCol] of Object.entries(columnMapping)) {
    const value = row[excelCol]
    normalized[field] = (value === undefined || value === null || value === '') ? null : value
  }
  return normalized
}

export function parseDate(value) {
  if (!value) return null
  if (typeof value === 'number') {
    return new Date((value - 25569) * 86400 * 1000).toISOString().split('T')[0]
  }
  if (typeof value === 'string') {
    const v = value.trim()
    const parts = v.split('/')
    if (parts.length === 3) {
      const [d, m, y] = parts
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
    }
    const d = new Date(v)
    if (!isNaN(d)) return d.toISOString().split('T')[0]
  }
  return null
}

export function calculateTeam(row, teamRules) {
  const lawyer = row.namelawyer?.trim()
  const area = row.namearea?.trim()

  // Prioridade 1: advogado
  if (lawyer) {
    const rule = teamRules.find(r => r.rule_type === 'lawyer' && r.active && normalize(r.rule_value) === normalize(lawyer))
    if (rule) return rule.team_name
  }

  // Prioridade 2: área
  if (area) {
    const rule = teamRules.find(r => r.rule_type === 'area' && r.active && normalize(r.rule_value) === normalize(area))
    if (rule) return rule.team_name
  }

  return null // sem regra = não importa
}

export function daysDiff(date1, date2) {
  if (!date1 || !date2) return null
  return Math.round((new Date(date2) - new Date(date1)) / (1000 * 60 * 60 * 24))
}
