# Dashboard Salários 2024

Dashboard web estático para análise de remuneração, vínculos e massa salarial por atividade econômica da RAIS 2024, com níveis hierárquicos da CNAE 2.0.

## Arquivos

- `index.html`: arquivo principal do dashboard.
- `assets/styles.css`: estilos visuais e responsividade.
- `assets/app.js`: lógica de filtros, agregações, indicadores, gráficos e exportações.
- `data.js`: base tratada incorporada como objeto JavaScript para permitir abertura offline.
- `dados_rais_salarios_2024.csv`: base tratada em CSV UTF-8.
- `dados_rais_salarios_2024.json`: base tratada em JSON.

## Variáveis utilizadas

A base original `RAIS_2024_med_unificada.dta` foi padronizada para:

- `ano`
- `territorio`
- `chave`
- `cnae_codigo`
- `secao_cod`, `secao_nome`
- `divisao_cod`, `divisao_nome`
- `grupo_cod`, `grupo_nome`
- `classe_cod`, `classe_nome`
- `subclasse_cod`, `subclasse_nome`
- `salario`: remuneração mediana nominal mensal disponível na base original (`vlremunmédianom`)
- `vinculos`: número de vínculos (`n_vinculos`)
- `massa_salarial`: calculada como `salario * vinculos`

## Cálculos principais

A base fornecida contém remuneração mediana por subclasse. Para agregações em níveis superiores da CNAE, o dashboard calcula:

```text
salario_agregado = soma(salario_atividade * vinculos_atividade) / soma(vinculos_atividade)
```

Essa medida deve ser interpretada como média ponderada das medianas disponíveis, não como mediana estatística recalculada a partir de microdados.

Também são calculados:

```text
salario_relativo = salario_atividade / salario_referencia_nacional

diferenca_abs = salario_atividade - salario_referencia_nacional

diferenca_pct = ((salario_atividade / salario_referencia_nacional) - 1) * 100

share_vinculos = vinculos_atividade / vinculos_total

share_massa_salarial = massa_salarial_atividade / massa_salarial_total
```

O índice exploratório de priorização usa pesos editáveis na interface:

```text
indice_priorizacao =
peso_salario * salario_relativo_padronizado +
peso_vinculos * share_vinculos_padronizado +
peso_massa * share_massa_salarial_padronizado +
peso_distancia * distancia_media_nacional_padronizada
```

Os pesos são normalizados internamente pela soma dos pesos informados.

## Filtros disponíveis

- Ano
- Unidade territorial ou referência
- Nível CNAE: Seção, Divisão, Grupo, Classe, Subclasse
- Seleção encadeada da hierarquia CNAE
- Faixa salarial relativa à referência nacional
- Classe de vínculos
- Critério de classificação visual: quartis, decis, Jenks, acima/abaixo da referência nacional ou mediana das atividades
- Ranking: maiores salários, menores salários, maior índice, maior número de vínculos ou maior massa salarial
- Pesos ajustáveis do índice de priorização

## Visualizações

- Cards de indicadores sintéticos
- Bloco automático "Leitura para políticas públicas"
- Ranking horizontal de atividades
- Dispersão salário × vínculos
- Boxplot sintético por seção
- Histograma da remuneração
- Treemap da massa salarial
- Barras 100% de vínculos e massa salarial por seção
- Matriz de priorização
- Tabela analítica com busca, ordenação e exportação CSV

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub, por exemplo `dashboard-salarios-2024`.
2. Envie todos os arquivos e pastas deste pacote para a raiz do repositório.
3. No GitHub, acesse **Settings > Pages**.
4. Em **Build and deployment**, selecione:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
5. Salve.
6. Aguarde a publicação. O endereço terá o formato:
   `https://SEU_USUARIO.github.io/dashboard-salarios-2024/`

## Uso offline

Basta abrir `index.html` diretamente no navegador. O dashboard usa `data.js`, não depende de bibliotecas externas e não requer internet para funcionar.

## Observações metodológicas

- A RAIS captura apenas vínculos formais.
- Remuneração não mede sozinha valor adicionado.
- Atividades com salários elevados podem ter baixa escala ocupacional.
- Atividades com muitos vínculos podem ter remuneração menor, mas alta relevância social.
- A massa salarial é uma aproximação da importância econômica formal.
- A seleção de atividades elegíveis para políticas públicas deve considerar também encadeamentos produtivos, externalidades, sustentabilidade, inovação, concentração de mercado, aderência territorial e potencial real de diversificação produtiva.
