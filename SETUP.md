# Setup — Dashboard RMA Fotus

## Pré-requisitos
- Node.js 18+ instalado: https://nodejs.org
- Conta no Supabase: https://supabase.com
- Conta na Vercel: https://vercel.com
- Conta no GitHub: https://github.com

---

## 1. Instalar dependências

Abra um terminal nesta pasta e execute:

```bash
npm install
```

---

## 2. Criar projeto no Supabase

1. Acesse https://supabase.com e crie uma conta/faça login
2. Clique em **New project**
3. Preencha nome do projeto (ex: `dashboard-rma-fotus`) e senha do banco
4. Aguarde o projeto ser criado (~1 min)

### Executar o schema SQL

1. No painel do Supabase, vá em **SQL Editor** (menu lateral)
2. Copie o conteúdo de `supabase/migrations/001_schema.sql`
3. Cole no editor e clique **Run**
4. Aguarde as tabelas serem criadas

### Obter as credenciais

1. Vá em **Settings → API**
2. Copie:
   - **Project URL** → ex: `https://abcdefgh.supabase.co`
   - **anon / public key** → chave longa começando com `eyJ...`

---

## 3. Configurar variáveis de ambiente

Abra o arquivo `.env.local` e substitua os valores:

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_aqui
```

---

## 4. Rodar localmente

```bash
npm run dev
```

Acesse: http://localhost:3000

---

## 5. Deploy na Vercel

### 5a. Subir para o GitHub
```bash
git init
git add .
git commit -m "feat: dashboard RMA inicial"
git remote add origin https://github.com/SEU_USUARIO/dashboard-rma.git
git push -u origin main
```

### 5b. Conectar na Vercel
1. Acesse https://vercel.com e faça login
2. Clique **New Project** → selecione o repositório `dashboard-rma`
3. Na seção **Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Clique **Deploy**
5. Após o deploy, a Vercel fornece uma URL pública

---

## 6. Importar os dados

1. Acesse o dashboard (local ou Vercel)
2. Clique em **Importar Planilhas**
3. Selecione os 4 arquivos (pode selecionar todos de uma vez):
   - `Relatorio_Vendas_Total.xlsx`
   - `Relatorio_RMA_Total.xlsx`
   - `Estoque danificados.xlsx`
   - `Relatorio_MTTF.xlsx`
4. O sistema detecta automaticamente o tipo de cada arquivo
5. Clique **Importar** e aguarde

---

## Planilhas aceitas

| Arquivo | Colunas obrigatórias |
|---|---|
| Vendas | Data da Venda, Cód. do Produto, Descrição do Produto, Quantidade Vendida |
| RMA | Cód. do Produto, Data de Criação, Produto, Fabricante, Problemática, Estado |
| Estoque | SN, PRODUTO, FABRICANTE, STATUS, TIPO |
| MTTF | Produto, Média de MTTF |

---

## Dúvidas

Para suporte, consulte a documentação:
- Next.js: https://nextjs.org/docs
- Supabase: https://supabase.com/docs
- Vercel: https://vercel.com/docs
