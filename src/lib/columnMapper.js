// Mapeamento de colunas: aceita tanto inglês quanto português
export const COLUMN_MAP = {
  processid: ['processid', 'Id do Processo', 'id do processo', 'ID do Processo'],
  createdate: ['createdate', 'Data Cadastramento', 'data cadastramento', 'Data de Cadastramento'],
  distributiondate: ['distributiondate', 'Data Ajuizamento', 'data ajuizamento', 'Data de Ajuizamento'],
  closedatepartial: ['closedatepartial', 'Data Encerramento Parcial', 'data encerramento parcial'],
  closedate: ['closedate', 'Data Encerramento', 'data encerramento', 'Data de Encerramento'],
  closereason: ['closereason', 'Motivo Encerramento', 'motivo encerramento', 'Motivo do Encerramento'],
  namearea: ['namearea', 'Área', 'area', 'área'],
  namelawyer: ['namelawyer', 'Advogado Responsável Processo', 'advogado responsável processo', 'Advogado', 'advogado'],
  namestate: ['namestate', 'Estado', 'estado'],
  nameactiontype: ['nameactiontype', 'Tipo de Ação', 'tipo de ação', 'tipo acao', 'Tipo Ação'],
  totalvalue: ['totalvalue', 'Valor da Causa', 'valor da causa', 'Valor Causa'],
}

// Detecta qual coluna do Excel corresponde a qual campo interno
export function detectColumns(headers) {
  const mapping = {}
  const headersLower = headers.map(h => h?.toString().trim())

  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    for (const alias of aliases) {
      const idx = headersLower.findIndex(
        h => h?.toLowerCase() === alias.toLowerCase()
      )
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
    // Excel serial date
    const date = new Date((value - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
  if (typeof value === 'string') {
    // Tenta formato DD/MM/YYYY
    const parts = value.split('/')
    if (parts.length === 3) {
      const [d, m, y] = parts
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
    }
    // Tenta ISO
    const d = new Date(value)
    if (!isNaN(d)) return d.toISOString().split('T')[0]
  }
  return null
}

// Calcula equipe com base nas regras
export function calculateTeam(row, teamRules) {
  const lawyer = row.namelawyer?.trim()
  const area = row.namearea?.trim()

  // Prioridade 1: Advogado
  if (lawyer) {
    const lawyerRule = teamRules.find(
      r => r.rule_type === 'lawyer' &&
           r.active &&
           r.rule_value.toLowerCase() === lawyer.toLowerCase()
    )
    if (lawyerRule) return lawyerRule.team_name
  }

  // Prioridade 2: Área
  if (area) {
    const areaRule = teamRules.find(
      r => r.rule_type === 'area' &&
           r.active &&
           r.rule_value.toLowerCase() === area.toLowerCase()
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
