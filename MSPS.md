# msps_quickdraw — fork do Quickdraw para o MSPowerSearch

Fork de [quickdrawjs/quickdraw](https://github.com/quickdrawjs/quickdraw) (MIT) usado nas notas
**"Escrita à mão"** do MSPowerSearch (web `msps_ui` e app MAUI, via o editor web do app).

Toda alteração no motor de escrita é feita **aqui**, nunca no `msps_ui`.

## Como o MSPowerSearch consome

- `msps_ui/package.json`: `"@quickdrawjs/core": "file:../msps_quickdraw/packages/core"`
  (o npm cria um link; editar aqui reflete direto no `npm run dev` do msps_ui).
- `msps_ui/vite.config.ts`: `server.fs.allow` inclui `../msps_quickdraw/packages/core`.
- Só o pacote `packages/core` é usado. `react`, `react-native` e `apps/*` ficam como estão.
- O editor do app MAUI é gerado com `npm run build:mobile-editor` no `msps_ui`;
  rode de novo depois de mudar a lib.

## Regras para alterar

1. **Recurso novo em arquivo próprio** em `packages/core/src/` (ex.: `pens.js`, `erase.js`),
   com o mínimo de mudanças nos arquivos originais (`editor.js`, `shapes.js`, `freehand.js`).
   Assim os merges com o upstream continuam simples.
2. Marque os trechos alterados em arquivos originais com `// msps:` e o motivo.
3. **Compatibilidade de dados**: traços já salvos não podem mudar de aparência.
   Propriedades novas são opcionais (ex.: traço sem `pen` = tinta original).
4. Teste em `packages/core/test/` para cada recurso; `npx vitest run packages/core`.
5. Atualize `packages/core/types/index.d.ts` quando a API pública mudar.

## Atualizar com o upstream

```bash
git fetch upstream
git merge upstream/main
npx vitest run packages/core
```

## Fases (plano)

| Fase | O quê | Status |
|---|---|---|
| 1 | Tipo de nota "Escrita à mão" com a lib como veio | feita |
| 2 | Ligar o MSPowerSearch neste fork | feita |
| 3 | Papel de caderno: pautas presas ao papel (Estreito/Médio/Largo), margem vermelha — `paper.js` | feita |
| 4 | Canetas (esferográfica, lápis) — `pens.js` + barra própria no msps_ui | feita |
| 5 | Canetas salvas (tipo + cor + espessura + opacidade, troca com um toque) — só msps_ui + API (`/api/notes/preferences/handwriting-pens`), a lib não muda | feita |
| 6 | Borracha (parcial, traço inteiro, ponta-borracha da caneta) — `erase.js` | feita (em teste) |
| 7 | Performance (traço vivo fora do store, cache da tela, contorno incremental, eventos previstos, diagnóstico) — `fastink.js`, `liveink.js`, `diagnostics.js` | feita (em teste) |
| 8 | Acabamento (miniatura — `thumbnail.js`; compactação sem perda dos pontos no MSPowerSearch; impressão já adiantada) | feita (em teste) |

## Recursos do fork

- **Papel de caderno** (`src/paper.js`): `new Editor({ paper })` / `editor.setPaper(paper | null)`.
  `paper = { lines: 'none'|'narrow'|'medium'|'wide', margin: boolean, marginX?: number }`.
  Espaçamentos em px do papel: 24 / 30 / 40 (`wide` = o `ruled` original). Quando há papel,
  ele substitui a grade adaptativa da lib (hook único em `Editor._drawGrid`).
  Com papel, `fitContent()` enquadra pelo começo da folha (`paperFitCamera`): x = 0 na borda
  esquerda, sem centralizar — senão, em tela larga, a margem ia parar no meio.
- **Canetas de escrita** (`src/pens.js`): `editor.setStyle('pen', 'ballpoint' | 'pencil')`; o próximo
  traço 'draw' grava `props.pen` (e não grava `dash`). Traço sem `pen` = tinta original.
  Esferográfica: fina, pouca variação com a pressão, pouco atraso. Lápis: mais largo, grão de
  grafite em pixels da tela, mais escuro com mais pressão (`pencilAlpha`). Hooks em `shapes.js`
  (`drawPath`, `inkReach`, `drawShape`) e em `editor.js` (`_beginDraw`, `setStyle`, `currentStyles`).
- **Borracha parcial** (`src/erase.js`): `editor.setEraser({ mode: 'stroke' | 'partial', size: 's' | 'm' | 'l' })`.
  Padrão da lib continua `'stroke'` (traço inteiro). Em `'partial'`, a borracha (círculo de raio fixo na
  tela: 6/12/24 px) corta só os traços de tinta (draw/highlight) ao vivo, em pedaços; outras formas saem
  inteiras. O gesto todo é um passo de desfazer. Traço girado vira pedaços sem rotação (mesmo lugar).
  A ponta-borracha da caneta (`buttons & 32`) apaga com qualquer ferramenta. Hooks em `editor.js`
  (`_pointerDown`, `_beginErase`/`_extendErase`/`_eraseAt`/`_endErase`, overlay).
- **Escrita rápida** (`src/fastink.js`, opção `fastInk` do `Editor`, desligada por padrão): durante o traço
  os pontos ficam num buffer da sessão (`session.live`) e vão para o store a cada `LIVE_COMMIT_MS` e no fim
  (o desfazer continua um passo só); o resto da tela vira uma imagem em cache (refeita só se câmera, tamanho,
  tema, papel ou outro shape mudarem) e cada quadro desenha só o traço em andamento por cima. Pontos
  previstos (`getPredictedEvents`, `predictInk`) estendem a ponta só na tela. O traço salvo é idêntico ao do
  modo normal (`test/fastink.test.js`). Hooks em `editor.js` marcados `// msps:`; `renderScene` ganhou `skipId`
  e `drawShape` ganhou `opts.inkPath`.
- **Contorno incremental** (`src/liveink.js`, `createLiveOutline`): o algoritmo do perfect-freehand em partes —
  guarda o que não muda mais e processa só a ponta. Resultado igual a `strokeOutline` número a número
  (`test/liveink.test.js`). Num traço de 2000 pontos: ~0,15 ms por quadro contra ~4,5 ms.
- **Baixa latência** (opção `lowLatency`): canvas com `desynchronized: true` onde o navegador suporta.
- **Diagnóstico** (`src/diagnostics.js`, `editor.setDiagnostics(true)`): painel no canto com quadros/s, tempo
  do quadro, caneta→quadro e tamanho do traço. No MSPowerSearch: `?hwdiag=1` na URL.
- **Miniatura** (`src/thumbnail.js`, `renderThumbnail(editor, opts)`): data URL (webp; jpeg onde o navegador não
  gera webp) do começo da página — largura do conteúdo cabendo na imagem, corte embaixo; com papel, encosta na
  borda esquerda dele (margem aparece). Desenha com o tema pedido (padrão claro) e devolve o do editor.
  O MSPowerSearch grava a miniatura na nota (`thumb`, antes do `snapshot`) e a API a devolve na lista.
- **Sem simplificação de traços:** o perfect-freehand suaviza com `streamline` ponto a ponto, então tirar pontos
  muda o desenho do traço. A compactação é feita sem perda no MSPowerSearch (`ptsV`: varint zigzag das
  diferenças, ~50% menor que o `ptsZ`, que continua sendo lido).
