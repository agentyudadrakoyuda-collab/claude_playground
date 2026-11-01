# CLAUDE.md · DrakoYuda Roadbook v1 (Drako · OS03)

Activação: `WAKE UP DRAKO · OS03 — ROADBOOK v1`. Brief completo em `BRIEF.md`.
Registo: linguagem controlada, uma instrução por frase. Texto do produto em português, ortografia pré-AO90 (acção, direcção, recta, projecto, óptimo).

## Arranque (secção 0 do brief)
- O Drako é separado da Fábrica. Não usar pastas da Fábrica.
- Fazer um commit no fim de cada marco M1–M6.
- `sources/` é só leitura. Não editar ficheiros dentro de `sources/`.
- Node 20 ou superior. Versões fixadas em `package.json`. three.js r128 vem do v3 (`node build/extract-v3.js`).
- Build: `node build/build.js`. Testes: `npm test` (unidade: `node --test tests/unit/*.test.js`; extremo a extremo: `node tests/e2e/run.js`).

## Termos (secção 2)
- Anfitrião: o cliente. Recebe convidados num local difícil de encontrar.
- Convidado: a pessoa que conduz até ao local. O co-piloto lê o guia.
- Studio: a ferramenta interna (`dist/roadbook-studio.html`). Só o André a usa.
- Navigator: o ficheiro HTML único que o convidado recebe.
- Ponto: uma paragem do guia, com km, instrução e foto opcional.
- Rascunho: os pontos e textos que o Studio gera sozinho a partir do GPX.
- Projecto: o ficheiro `.roadbook` com o trabalho de um percurso.

## Restrições técnicas (secção 8)
- O Studio é um HTML único. Cada Navigator é um HTML único.
- three.js r128 dentro do ficheiro. Versões fixadas.
- Sem service workers. Sem backend, base de dados ou contas.
- O Navigator funciona como ficheiro aberto do WhatsApp e como artefacto claude.ai.
  No artefacto não há fetch a outros domínios, o download só funciona pela capacidade `downloads` e a geolocalização está bloqueada.
- Respeitar `prefers-reduced-motion`. A 360 px não há scroll horizontal.
- Envolver cada leitura e escrita de armazenamento (IndexedDB, localStorage, sessionStorage) em try/catch.

## Critérios de aceitação (secção 10)
- AC1: só a partir do GPX Meraki, o rascunho encontra as 8 entradas de controlo (km ±0,2) e a zona lenta das pontes.
- AC2: uma foto com hora fica a 150 m ou menos da posição real (3 fotos Meraki, 10:59, 11:10:45, 11:11:20, hora de Luanda).
- AC2b: um GPX sem fotos exporta um Navigator completo e utilizável.
- AC3: o Navigator funciona do início ao fim com a rede desligada.
- AC4: simulação GPS em 8 posições; o ponto 1 não é saltado; sem aviso de desvio no trajecto; aviso a 300 m fora; perda breve de sinal não desliga o seguimento.
- AC5: duas marcas fictícias, uma clara e uma escura, passam 4,5:1 nos textos.
- AC6: Navigator Meraki com 3 MB ou menos e sem EXIF nas fotos.
- AC7: o Navigator não tem controlos de edição nem marca DrakoYuda por omissão.
- AC8: um .roadbook guardado e reaberto fica idêntico.
- AC9: a 360 px não há scroll horizontal; temas claro e escuro; zero erros na consola no Studio e no Navigator.
- AC10: o guia de captação cabe numa página A4.

## Estrutura
- `src/shared/` geometria, GPX/KML/KMZ, EXIF, marca, rascunho, projecto, montagem do Navigator (correm no browser e em Node).
- `src/navigator/` modelo do Navigator, guia (`guide.js`), motor 3D extraído do v3, three.js r128.
- `src/studio/` interface do Studio.
- `build/` build e extracção do v3. `tests/` unidade e Playwright. `dist/` entregáveis. `docs/` guia e relatório.
