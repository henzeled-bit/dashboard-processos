# Dashboard PGJ — Gestão de Processos

Sistema de dashboard para análise de processos jurídicos com importação de planilhas.

## Stack
- **Frontend:** Next.js 14 + React
- **Banco de dados:** Supabase
- **Hospedagem:** Vercel

## Configuração

### 1. Clone o repositório
```bash
git clone https://github.com/SEU_USUARIO/dashboard-processos.git
cd dashboard-processos
npm install
```

### 2. Variáveis de ambiente
Crie um arquivo `.env.local` na raiz do projeto:
```
NEXT_PUBLIC_SUPABASE_URL=https://aecgmaklgyktxyxbgqgi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_publishable_key_aqui
```

### 3. Rodar localmente
```bash
npm run dev
```
Acesse: http://localhost:3000

## Acesso padrão
- **Email:** admin@pgj.com  
- **Senha:** admin123

## Funcionalidades
- Login com autenticação por banco de dados
- Importação de planilhas .xlsx e .csv
- Detecção automática de colunas em inglês ou português
- Upsert por ID de processo (atualiza ou cria)
- Classificação automática de equipes por regras configuráveis
- Dashboard com gráficos:
  - Cadastros vs Encerramentos por mês
  - Evolução do estoque ativo
  - Processos por equipe
  - Prazo de encerramento por equipe (30 dias TJ → PGJ)
  - Motivos de encerramento
  - Processos por estado
  - Valor por equipe
  - Tempo médio cadastro → ajuizamento
  - Tempo médio ajuizamento → encerramento
- Configuração de regras de equipes sem precisar de código
- Gerenciamento de usuários
