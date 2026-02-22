// Mapeamento de colunas: aceita tanto inglês quanto português
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
  nameactiontype: ['nameactiontype', 'Tipo de Acao', 'Tipo de Ação', 'Tipo Acao'],
  totalvalue: ['totalvalue', 'Valor da Causa', 'Valor Causa'],
}

// Normaliza string para comparação: minúsculo, sem acentos, sem espaços extras
function normalize(s) {
  if (!s) return ''
  return s.toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

// Detecta qual coluna do Excel corresponde a qual campo interno
export function detectColumns(headers) {
  const mapping = {}
  const headersNorm = headers.map(h => normalize(h))

  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    for (const alias of aliases) {
      const aliasNorm = normalize(alias)
      const idx = headersNorm.findIndex(h => h === aliasNorm)
      if (idx !== -1) {
        mapping[field] = headers[idx]
        break
      }
    }
  }
  return mapping
}

// Converte linha do Excel para objeto normalizado
export function normalizeRow(row, columnMapping) {
  const normalized = {}
  for (const [field, excelCol] of Object.entries(columnMapping)) {
    let value = row[excelCol]
    if (value === undefined || value === null || value === '') {
      normalized[field] = null
    } else {
      normalized[field] = value
    }
  }
  return normalized
}

// Converte datas do Excel (número serial ou string)
export function parseDate(value) {
  if (!value) return null
  if (typeof value === 'number') {
    const date = new Date((value - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
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

// Calcula equipe com base nas regras (advogado tem prioridade sobre área)
export function calculateTeam(row, teamRules) {
  const lawyer = row.namelawyer?.trim()
  const area = row.namearea?.trim()

  if (lawyer) {
    const lawyerRule = teamRules.find(
      r => r.rule_type === 'lawyer' &&
           r.active &&
           normalize(r.rule_value) === normalize(lawyer)
    )
    if (lawyerRule) return lawyerRule.team_name
  }

  if (area) {
    const areaRule = teamRules.find(
      r => r.rule_type === 'area' &&
           r.active &&
           normalize(r.rule_value) === normalize(area)
    )
    if (areaRule) return areaRule.team_name
  }

  return 'Sem Equipe'
}

// Calcula diferença em dias entre duas datas
export function daysDiff(date1, date2) {
  if (!date1 || !date2) return null
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
}
