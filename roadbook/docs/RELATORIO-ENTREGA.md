# Relatório de entrega · DrakoYuda Roadbook v1

Data: 01-11-2026 · Builder: Drako (sessão Claude Code) · Dono (E): André Pitra
Brief: BRIEF-DRAKO-2026-11-01-ROADBOOK (cópia em `BRIEF.md`). Etapas S, M e D executadas numa só sessão, sem validações intermédias.

## 1. Resumo

- O Studio (`dist/roadbook-studio.html`) transforma um GPX, KML ou KMZ num Navigator offline com a marca do anfitrião.
- O rascunho automático encontra as 8 entradas de controlo Meraki e a zona lenta das pontes, só a partir do GPX.
- O Navigator mantém o comportamento do "Chegar à Meraki" v3 e acrescenta "Faltam X km", o aviso de desvio, a marca e o contacto do anfitrião.
- Testes: 11/11 de unidade e 15/15 extremo a extremo (Playwright) passam. O guia de captação cabe numa página A4.
- Antes de enviar o `chegar-a-meraki-v4.html` aos convidados, o André tem de trocar o contacto e o logótipo provisórios (secção 4, D3).

## 2. Entregáveis

| Ref. | Ficheiro | Notas |
| :- | :- | :- |
| E1 | `dist/roadbook-studio.html` | HTML único, 1,07 MB. Corre como ficheiro local. |
| E2 | Motor do Navigator dentro do Studio; `dist/exemplo-navigator-marca-ficticia.html` | Marca fictícia clara "Quinta Limão" (amarelo ajustado para passar 4,5:1). |
| E3 | `dist/chegar-a-meraki-v4.html` (1,15 MB) e `dist/chegar-a-meraki.roadbook` | Gerados no Studio pelo teste M4. Extra: `dist/chegar-a-meraki-pontos.gpx` (R-S15). |
| E4 | `docs/guia-de-captacao.md` e `docs/guia-de-captacao.pdf` | 1 página A4. |
| E5 | `docs/RELATORIO-ENTREGA.md` | Este documento. |

Código: `src/shared/` (biblioteca partilhada), `src/navigator/`, `src/studio/`, `build/`, `tests/`. Comandos: `npm install` e `npm test`.

## 3. Testes e resultados

Ambiente: Node 22.23.4, Playwright 1.63.0 (Chromium pré-instalado), Linux. Última execução: 01-11-2026.

| AC | Resultado | Evidência |
| :- | :- | :- |
| AC1 | Passa | Rascunho do GPX Meraki: 11 pontos. Entradas 1–8 encontradas a km 0,00 · 0,15 · 2,66 · 2,80 · 4,75 · 5,38 · 5,67 · 5,94 (+ chegada 7,58). Zona lenta: km 2,66–2,89. Fluxo no Studio até ao v4: 46 acções. Ver nota A1. |
| AC2 | Passa | Fotos colocadas pela hora (UTC+1): Cirilu a 1 m, árvore isolada a 0 m, ruínas a 41 m da posição real (waypoints do v3). Unidade e Studio. |
| AC2b | Passa | GPX sem tempos e sem fotos → Navigator de 10 pontos, percorrido do início ao fim sem rede. |
| AC3 | Passa | v4 percorrido nos 9 ecrãs com a rede desligada; fotos e fontes embebidas carregam; o 3D abre e volta ao guia sem excepções. |
| AC4 | Passa | 8 posições (km 0,02 · 1,0 · 2,7 · 3,6 · 4,75 · 5,35 · 5,7 · 7,5) → pontos 1 a 8, sem saltar o ponto 1, sem aviso de desvio. A 300 m: a 1.ª leitura não avisa, a 2.ª avisa; o aviso não pisca e sai ao voltar ao trajecto. Erros de código 2 e 3 não desligam o seguimento. |
| AC5 | Passa | Contraste medido no Navigator. "Quinta Limão" (#f2d649 → #7b6809): claro 4,75 / 5,49, escuro 5,25 / 5,45. "Casa Noite" (#5b2a86): claro 8,58 / 9,90, escuro 5,13 / 5,32 (cor principal sobre o fundo / texto do botão e do km). Texto corrido 13,7 e 15,9. |
| AC6 | Passa | v4 com 1,15 MB. 3 fotos JPEG (76, 16 e 30 kB) sem segmento APP1 (sem EXIF nem XMP). |
| AC7 | Passa | Zero campos de edição no Navigator. Sem texto "DrakoYuda" com o crédito desligado. Com o interruptor ligado, o crédito aparece. |
| AC8 | Passa | `.roadbook` guardado, reaberto no Studio e guardado de novo: idêntico byte a byte. Também em unidade (`deepEqual`). |
| AC9 | Passa | 360 px sem scroll horizontal no Navigator (9 ecrãs, claro e escuro) e no Studio (claro e escuro). Zero erros na consola nos dois (ver nota A9). |
| AC10 | Passa | `docs/guia-de-captacao.pdf` tem 1 página A4 (verificado por `build/guia-pdf.js`). |
| AC11 | Fora desta sessão | Fase L, dono André: três pilotos reais. |

Testes adicionais que passam: KMZ com dois trajectos e escolha (R-S1, R-S2); HEIC recusado com "converta para JPEG" (R-S5); bandeja e arrastar para o mapa com origem "manual" (R-S7, R-S8); ponto criado com um clique no trajecto e anular eliminação (R-S9); OpenStreetMap simulado: referência "junto a escola" no texto e confiança alta numa manobra com abrandamento e junção (R-A2, R-A9); pré-visualização 390×844 em claro e escuro com simulação GPS (R-S12); regressão M2 (os 9 ecrãs do v4 iguais ao v3 em títulos, textos, fotos, legendas e botões).

- **Nota A1.** A entrada 8 ("km 6,0–7,6 descida, duas curvas à direita, chegada") é encontrada como descida a km 5,94 e chegada a km 7,58. A descida real começa ao km 6,7 (há uma pequena subida entre 6,25 e 6,65); o rascunho junta o troço recto de 5,9 a 6,7 à descida. As duas curvas à direita finais (km 7,44) ficam como nota da chegada ("Antes de chegar, vire à direita").
- **Nota A1 (10 minutos).** O fluxo automatizado demora 9 s e tem 46 acções, das quais 30 são a colagem dos textos aprovados do v3. Sem essa colagem, o André faz cerca de 16 acções: largar ficheiros, 3 campos da marca, 1 clique de contraste, apagar 1 ponto, juntar 2 vezes, 7 confirmações e exportar. O tempo real do André não foi medido; confirmar no primeiro piloto.
- **Nota A9.** Neste ambiente a rede externa está bloqueada. Os testes do Studio correm com o contexto sem rede (o Studio não consulta o OpenStreetMap) ou com o OpenStreetMap simulado. Com rede real e o Overpass em baixo, o browser regista "Failed to load resource" na consola; o Studio continua sem referências, como pede o R-S20.

## 4. Desvios ao brief

- **D1 · Local de trabalho.** O brief pede `C:\Claude_work\Drako\roadbook\` e `git init` numa sessão local. Esta sessão correu num contentor Linux na nuvem. O trabalho está em `roadbook/` dentro do repositório `claude_playground`, ramo `ccr-7e877c4e-7ct09x`, com um commit por marco (M1, M2/M3, M4/M5, M6). Não foi criado um repositório git separado.
- **D2 · Fontes.** O GPX Meraki e o motor 3D original não estavam acessíveis (Projecto Claude "Fabrica"). O GPX foi extraído do `GUIDE_GPX` embebido no v3 (1081 pontos, 1 s, 09:58:49–10:16:49 UTC); o nome mantém `meraki-20261101-105849.gpx`. Este GPX já traz 8 waypoints do v3; o Studio ignora-os na geometria (R-S2). O motor 3D usado é o "Rota em Relevo v6" tal como integrado no v3 (o brief manda integrar "como no Meraki v3"); o `rota-em-relevo-v6.html` original não foi consultado. As 3 fotos foram extraídas dos data URI do v3 (já sem EXIF).
- **D3 · Marca Meraki provisória.** Não havia logótipo nem contacto da Meraki. O v4 usa um logótipo provisório (`tests/fixtures/meraki-logo.svg`, desenhado nesta sessão) e o número **+244 900 000 000**, que não é real. Trocar os dois no Studio (abrir `chegar-a-meraki.roadbook`) antes de enviar aos convidados.
- **D4 · Textos do v4.** Para a regressão M2, os títulos e as instruções do v4 são os textos aprovados do v3, colados no Studio. O rascunho automático, a colocação das fotos e a marca foram feitos pelo Studio. O v4 usa os gatilhos GPS do v3.
- **D5 · Cor Meraki.** A cor laranja do v3 (#b0531f) tem só 4,43:1 sobre o fundo claro. O Studio propôs #ad521e (4,54:1), que o v4 usa. O tema escuro usa a variante #d86726 (5,1:1) calculada pela mesma regra.
- **D6 · Regra de contraste nos dois temas.** Uma única cor raramente passa 4,5:1 sobre o fundo claro e sobre o fundo escuro. A cor escolhida tem de passar no tema claro; o tema escuro usa sempre a cor mais próxima que passa, calculada automaticamente. O texto sobre a cor (botões, km) é branco ou quase preto, o que tiver mais contraste.
- **D7 · Marca do Studio.** O Brand Canon v3 encontrado no Drive (`brand-canon-v3.0-tokens.css`) está marcado como substituído e tem uma paleta selada diferente (Forest #228B22, Flame #FF6B35). O Brand Showcase 01 (HTML de 7 MB) não foi lido por inteiro. O Studio usa o fallback do brief: verde #2D5F3F, dourado #D4AF37 e a fonte Tomorrow (os mesmos valores do motor 3D do v3).
- **D8 · Estrada de acesso.** O v3 tinha a estrada desenhada à mão. Sem rede, o Studio desenha um segmento de 1,6 km perpendicular ao início do trajecto; com rede, usa a via principal do OpenStreetMap a menos de 250 m do início. Os nomes das pontas (ex.: Luanda, Caxito) são campos opcionais da marca.
- **D9 · Fontes tipográficas.** O v3 carregava as fontes do Google Fonts. O Navigator e o Studio levam as fontes dentro do ficheiro (Overpass, Atkinson Hyperlegible, Overpass Mono e Tomorrow, pacotes @fontsource 5.3.0), para o offline total e zero erros de consola. O Archivo e o JetBrains Mono do 3D usam as fontes de recurso.
- **D10 · Título e frase de chegada.** O brief não define o artigo do nome do local. O Studio tem um campo "Título do guia" (ex.: "Chegar à Meraki"); a frase final e "até à Meraki" saem desse título.
- **D11 · Playwright.** O `@playwright/test` não está instalado; usa-se o Playwright 1.63.0 pré-instalado com um mini-harness (`tests/e2e/harness.js`). A versão fica registada em `package.json` (notes) e não em `devDependencies`, para não instalar um segundo Chromium.
- **D12 · Pontos de paragem (R-A6).** As paragens entram como candidatos de confiança baixa. Quando é preciso cortar para 12 pontos, saem primeiro. No GPX Meraki não houve paragens de 15 s fora do início e do fim.

## 5. Limites conhecidos

- **GPS no telemóvel real.** A posição GPS no ficheiro aberto pelo WhatsApp não foi testada num telemóvel real (risco 13 do brief). Os testes usam uma geolocalização simulada. Confirmar no AC11.
- **App de iPhone.** O Open GPX Tracker foi seleccionado e verificado no código-fonte (cada ponto grava `time` e `elevation`: `GPXTrackPoint+MapKit.swift`). Não foi testado num iPhone nesta sessão. Gravar um percurso de teste antes do primeiro piloto iOS.
- **OpenStreetMap.** Neste ambiente o Overpass está bloqueado. As referências (R-A9) e a confiança alta (R-A2) foram testadas com respostas simuladas. Sem OpenStreetMap, nenhuma manobra chega a "alta": todas ficam "a confirmar".
- **Sentido da saída do asfalto.** O GPX não diz se o convidado vira à esquerda ou à direita no asfalto. O primeiro ponto propõe "esquerda" e fica sempre "a confirmar".
- **Curvas da picada.** O rascunho Meraki tem uma manobra a mais (curva à direita no km 4,1) que o v3 não tinha. Fica com confiança baixa e o André apaga-a (risco 13 do brief).
- **3D.** Em telemóveis antigos o 3D pode falhar; o Navigator testa o WebGL antes de abrir e volta ao guia. No artefacto claude.ai, as consultas do 3D a outros domínios (OpenStreetMap, satélite) ficam bloqueadas, como no v3.
- **Fotos.** A orientação EXIF é aplicada pelo browser ao reduzir. HEIC não é convertido no Studio (mensagem "converta para JPEG").
- **Tamanho.** O Navigator vazio tem cerca de 0,85 MB (three.js r128 e motor 3D). Cada foto acrescenta 15–80 kB. O alvo de 3 MB para 8 pontos tem margem larga.

## 6. Próximas acções

1. André: abrir `dist/chegar-a-meraki.roadbook` no Studio, trocar o logótipo e o contacto provisórios, exportar e enviar o Navigator.
2. André: testar o Navigator no telemóvel, aberto a partir do WhatsApp, com a posição GPS ligada na picada (risco 13).
3. André ou anfitrião iOS: gravar um percurso curto com o Open GPX Tracker e largá-lo no Studio.
4. Fase L (AC11): três pilotos reais, cada um com um convidado novo. Registar chamadas a pedir direcções e o tempo do André por percurso.
5. Drako: com rede, validar a consulta Overpass real (junções e referências) num percurso novo.

## 7. Ficheiros a carregar no Drive (pasta "Roadbook v1 · Brief Drako (2026-11-01)")

- `dist/roadbook-studio.html`
- `dist/exemplo-navigator-marca-ficticia.html`
- `dist/chegar-a-meraki-v4.html`
- `dist/chegar-a-meraki.roadbook`
- `dist/chegar-a-meraki-pontos.gpx`
- `docs/guia-de-captacao.md`
- `docs/guia-de-captacao.pdf`
- `docs/RELATORIO-ENTREGA.md`
