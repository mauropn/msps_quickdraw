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
| 3 | Papel de caderno: pautas presas ao papel (Estreito/Médio/Largo), margem vermelha — `paper.js` | feita (em teste) |
| 4 | Canetas (esferográfica, lápis) + barra própria no msps_ui | |
| 5 | Canetas salvas (tipo + cor + espessura + opacidade, troca com um toque) | |
| 6 | Borracha (parcial, traço inteiro, ponta-borracha da caneta) | |
| 7 | Performance (traço vivo fora do store, cache dos traços prontos, eventos previstos) | |
| 8 | Acabamento (miniatura, impressão, simplificação/compactação dos traços) | |

## Recursos do fork

- **Papel de caderno** (`src/paper.js`): `new Editor({ paper })` / `editor.setPaper(paper | null)`.
  `paper = { lines: 'none'|'narrow'|'medium'|'wide', margin: boolean, marginX?: number }`.
  Espaçamentos em px do papel: 24 / 30 / 40 (`wide` = o `ruled` original). Quando há papel,
  ele substitui a grade adaptativa da lib (hook único em `Editor._drawGrid`).
