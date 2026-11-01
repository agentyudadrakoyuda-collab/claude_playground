<!-- Cópia do Google Doc "BRIEF-DRAKO-2026-11-01-ROADBOOK" (Drive, pasta "Roadbook v1 · Brief Drako (2026-11-01)"), extraída a 2026-11-01. -->

# BRIEF-DRAKO-2026-11-01-ROADBOOK · DrakoYuda Roadbook v1
| Campo | Valor |
| Produto | DrakoYuda Roadbook (nome interno; o cliente não vê este nome) |
| Etapa PSMDL | P concluída. Este brief autoriza S, M e D. |
| Dono (E) | André Pitra |
| Builder | Drako, numa sessão Claude Code local |
| Modo | Entrega completa numa só sessão. Não pedir validações intermédias. Registar desvios no relatório final. |
| Registo | Linguagem controlada. Uma instrução por frase. O texto do produto é em português, ortografia pré-AO90. |



## 0. Arranque da sessão (Claude Code local)
Activação: WAKE UP DRAKO · OS03 — ROADBOOK v1

- Criar a pasta de trabalho C:\Claude_work\Drako\roadbook\. O Drako é separado da Fábrica. Não usar C:\Claude_work\Fabrica.
- Executar git init. Fazer um commit no fim de cada marco (secção 9).
- Criar esta estrutura:

roadbook/
  CLAUDE.md            ← regras desta secção 0 e das secções 2, 8 e 10
  BRIEF.md             ← cópia deste documento
  sources/             ← fontes da secção 7 (só leitura)
  src/studio/          ← código do Studio
  src/navigator/       ← motor e modelo do Navigator
  src/shared/          ← parser GPX/KML/KMZ, EXIF, geometria, rascunho automático
  build/               ← script que gera ficheiros HTML únicos
  tests/               ← testes Playwright e testes de unidade
  dist/                ← entregáveis finais
  docs/                ← guia de captação e relatório de entrega

- Ferramentas: Node 20 ou superior, Playwright e um script de build que coloca todo o CSS, JS, bibliotecas e imagens dentro de um HTML único. Fixar a versão de todas as dependências.
- Obter as fontes da secção 7. Se uma fonte não estiver acessível, pedir ao André só esse ficheiro. Não parar o trabalho que não depende dele.


## 1. Objectivo
Construir um serviço interno que transforma um percurso gravado num guia de chegada offline, com a marca do cliente. A DrakoYuda faz o trabalho nos bastidores. O cliente apresenta o guia aos convidados como seu. O sistema tira do GPX tudo o que pode. O André só confirma. O cliente envia o mínimo.
## 2. Termos
- Anfitrião: o cliente. Recebe convidados num local difícil de encontrar.
- Convidado: a pessoa que conduz até ao local. O co-piloto lê o guia.
- Studio: a ferramenta interna. Só o André a usa.
- Navigator: o ficheiro HTML único que o convidado recebe.
- Ponto: uma paragem do guia, com km, instrução e foto opcional.
- Rascunho: o conjunto de pontos e textos que o Studio gera sozinho a partir do GPX.
- Projecto: o ficheiro .roadbook com o trabalho de um percurso.
## 3. Fluxo do serviço
O anfitrião envia:

- obrigatório: o GPX ou KML gravado com a app GPS Logger, a conduzir do asfalto até à chegada;
- obrigatório: o nome do local, o logótipo e um número de contacto;
- opcional: fotos originais, só se o anfitrião quer imagens específicas. As fotos não devem ir pelo WhatsApp, porque o WhatsApp apaga a hora e o GPS.

O Studio faz automaticamente: o rascunho completo (secção 4), a colocação das fotos, as cores da marca a partir do logótipo, os textos de boas-vindas e a exportação.

O André faz:

- Larga os ficheiros no Studio.
- Confirma os pontos marcados "a confirmar".
- Exporta o Navigator.

O André não escreve texto de raiz. O alvo é 10 minutos por percurso.
## 4. Rascunho automático
- R-A1. Detectar as manobras. Calcular a mudança de rumo em janelas de 60 m. Uma mudança maior que 35° é uma manobra, à esquerda ou à direita. Duas manobras a menos de 150 m formam um só ponto, por exemplo "Vire à esquerda e logo à direita".

- R-A2. Classificar a confiança de cada manobra:

- alta: a manobra tem uma descida de velocidade e uma junção no OpenStreetMap;
- média: a manobra tem só uma das duas;
- baixa: a manobra não tem nenhuma das duas.

Os pontos de confiança média ou baixa ficam marcados "a confirmar".

- R-A3. Detectar os troços longos. Uma recta com mais de 1 km sem manobras dá um ponto "Siga em frente X km, cerca de Y min".

- R-A4. Detectar as subidas e as descidas. Uma variação maior que 20 m, em menos de 2 km, dá um ponto. Suavizar a altitude antes de calcular.

- R-A5. Detectar as zonas lentas. Abaixo de 15 km/h durante mais de 5 s, fora dos primeiros e dos últimos 150 m, criar um ponto "Atenção: troço lento (ponte, buraco ou areia)". Esta regra vale só quando o GPX tem tempos.

- R-A6. Detectar as paragens. Uma paragem de 15 s ou mais, fora do início e do fim, dá um ponto candidato.

- R-A7. O primeiro ponto é a saída do asfalto. O último ponto é a chegada. O texto usa o nome do local.

- R-A8. Escrever cada instrução com modelos em português pré-AO90. Cada modelo inclui o km, a manobra e a distância até ao ponto seguinte.

- R-A9. Quando há rede, juntar referências do OpenStreetMap a menos de 150 m de cada ponto, por exemplo "junto à escola X". Sem rede, o rascunho completa-se sem referências.

- R-A10. Limitar o rascunho a 12 pontos. Se houver mais, fundir os pontos mais próximos. Uma manobra tem prioridade sobre um troço.

- R-A11. Tirar a cor principal e a cor de destaque do logótipo. Aplicar a regra de contraste do R-S10.

- R-A12. Gerar o texto de boas-vindas e a nota "antes de sair" a partir de: o nome do local, a distância total, o tempo total e o número de pontos.

- R-A13. Calcular o gatilho GPS de cada ponto:

- numa manobra, mostrar o ponto 100 m antes;
- num troço, mostrar o ponto à entrada;
- o primeiro ponto aparece logo no início.
## 5. Requisitos do Studio
Importação

- R-S1. Importar GPX, KML e KMZ. Descomprimir o KMZ dentro do ficheiro, sem rede.
- R-S2. Se o ficheiro tem vários trajectos, o André escolhe um. Ignorar os waypoints do ficheiro na geometria.
- R-S3. O André pode cortar o início e o fim do trajecto.
- R-S4. Mostrar a distância, o tempo, a subida e o número de pontos do trajecto.

Fotos

- R-S5. Importar várias fotos JPEG de uma vez. Se a foto for HEIC, mostrar "converta para JPEG".
- R-S6. Ler o EXIF:
- se a foto tem GPS, usar o GPS;
- se a foto não tem GPS, procurar a hora no trajecto. Usar o fuso UTC+1 por omissão. O André pode alterar o fuso.
- R-S7. As fotos sem GPS e sem hora vão para uma bandeja. O André arrasta cada uma para o mapa.
- R-S8. Mostrar a origem da colocação de cada foto: GPS, hora ou manual. Associar cada foto ao ponto mais próximo, a 150 m ou menos. Se não houver ponto, propor um novo.

Edição do rascunho

- R-S9. O André corrige, apaga, junta ou arrasta pontos ao longo do trajecto. Os pontos ficam ordenados pelo km. Criar um ponto à mão é a excepção, com um clique no mapa. Anular uma eliminação, pelo menos uma vez. Campos de cada ponto: título (40 caracteres no máximo), instrução (220 no máximo), manobra (esquerda, direita, em frente, atenção, chegada), foto, legenda e gatilho.
- R-S10. Marca: os campos obrigatórios são o nome do local, o logótipo (PNG ou SVG) e o número de contacto. As cores vêm do R-A11. O André pode alterar as cores. Se o contraste for menor que 4,5:1, propor a cor mais próxima que passa. A leitura num carro em movimento tem prioridade sobre a cor exacta.
- R-S11. Mostrar o crédito "Feito com DrakoYuda" com um interruptor. O interruptor começa desligado.

Pré-visualização e exportação

- R-S12. Mostrar o Navigator numa moldura de telemóvel de 390×844, em claro e em escuro, com a simulação GPS a percorrer o trajecto.
- R-S13. Antes de exportar, executar uma lista de verificação. A exportação fica bloqueada até a lista passar. A lista verifica:
- não há pontos "a confirmar";
- todos os pontos têm instrução;
- o primeiro ponto é a saída do asfalto e o último é a chegada;
- a marca passa o contraste;
- o ficheiro tem 5 MB ou menos.
- R-S14. Exportar o Navigator como um HTML único. Reduzir as fotos para 900 px de largura, JPEG com qualidade 0,72. Apagar o EXIF de todas as fotos. O alvo é 3 MB ou menos para 8 pontos.
- R-S15. Exportar também um GPX com os pontos como waypoints.
- R-S16. Guardar e abrir o .roadbook em JSON, com as fotos dentro. Gravar automaticamente em IndexedDB. Envolver cada leitura e escrita em try/catch.
- R-S17. Mostrar sempre o aviso: "Este ficheiro contém a localização do anfitrião. Partilhe só com os convidados."

Uso e aspecto

- R-S18. Incluir o padrão de onboarding: uma visita guiada no primeiro uso e dicas contextuais em cada secção.
- R-S19. O Studio usa a marca DrakoYuda (Brand Showcase 01 / Brand Canon v3). Se o Canon não estiver acessível, usar verde #2D5F3F, dourado #D4AF37 e a fonte Tomorrow, e registar o facto no relatório.
- R-S20. O Studio corre como ficheiro local no computador do André. Com rede, consulta o OpenStreetMap (Overpass). Sem rede, funciona sem as referências. Os downloads usam <a download>.
## 6. Requisitos do Navigator
- R-N1. Base: manter o comportamento do "Chegar à Meraki" v3:
- o ecrã "antes de sair";
- os cartões com o km, a instrução e a foto;
- a faixa de quilometragem;
- o mapa SVG com o trajecto, os pontos e a estrada de acesso;
- os botões grandes Anterior e Seguinte;
- a ampliação das fotos;
- a posição GPS, com avanço pelos gatilhos;
- o GPS não anula a navegação manual;
- a tolerância a perdas breves de sinal (o código 2 ou 3 não desliga o seguimento);
- o Wake Lock;
- a gravação no telemóvel quando o guia está alojado num artefacto (capacidade downloads);
- os temas claro e escuro conforme o sistema.
- R-N2. Mostrar "Faltam X km" em cada cartão.
- R-N3. Mostrar um aviso de desvio só quando duas leituras seguidas estão a mais de 250 m do trajecto. O aviso é calmo e não pisca.
- R-N4. Aplicar a marca do anfitrião: o logótipo, as cores, o texto de boas-vindas e o contacto. O número aparece como texto, com um botão de copiar.
- R-N5. Vista 3D: usar o motor Rota em Relevo v6 integrado como no Meraki v3. Mostrar os pontos com as fotos. O 3D abre só a pedido. Mostrar o rótulo "melhor em casa, com rede". Se o WebGL falhar, voltar ao guia.
- R-N6. O Navigator não tem controlos de edição. O Navigator não tem marca DrakoYuda, a menos que R-S11 esteja ligado.
- R-N7. Offline total: todo o código, os dados e as fotos ficam dentro do ficheiro. Só o satélite e o OpenStreetMap precisam de rede. As fontes têm fallback.
- R-N8. Todo o texto do produto é em português, ortografia pré-AO90.
## 7. Fontes (S)
| Fonte | Local | Uso |
| Navigator de referência "Chegar à Meraki" v3 | Projecto Claude "Fabrica": claude/roadbook/sources/chegar-a-meraki-v3.html · artefacto https://claude.ai/artifact/FGvmH3PYkwXYP6RWB28q1e | Comportamento, textos dos 8 pontos, motor 3D integrado. As 3 fotos estão dentro, como data URI. Extrair as fotos para sources/. |
| GPX Meraki | Projecto "Fabrica": claude/roadbook/sources/meraki-20261101-105849.gpx | Teste de regressão do rascunho (AC1) |
| Motor 3D original | Projecto "Fabrica": claude/mapas-gpx/rota-em-relevo-v6.html | Referência do motor |
| Marca DrakoYuda | Brand Showcase 01 / Brand Canon v3 (Vito) | Aspecto do Studio |
| Rascunho rejeitado "Roadbook Studio & 3D Co-Pilot" | — | Usar só a ideia do KMZ e de "Faltam X km". Não reutilizar código. |


Dados Meraki de controlo (para o AC1): 7,58 km, cerca de 18 min, da saída junto ao Cirilu (prédio redondo inacabado, à direita para quem vem de Luanda; o convidado vira à esquerda) até à casa. Manobras e troços do v3:

- km 0,0 Cirilu, vire à esquerda;
- km 0,0–2,7 recta longa;
- km 2,7 esquerda e logo direita;
- km 2,8–4,6 subida de cerca de 30 m;
- km 4,7 vire à esquerda;
- km 5,3–5,4 curva à direita junto a uma árvore isolada;
- km 5,5–5,9 ruínas à esquerda, bifurcações sempre à esquerda;
- km 6,0–7,6 descida, duas curvas à direita, chegada.

Zona lenta conhecida: km 2,7–2,9 (duas pontes pequenas).
## 8. Restrições técnicas
- O Studio é um HTML único. Cada Navigator é um HTML único.
- Usar three.js r128 dentro do ficheiro. Fixar a versão de todas as bibliotecas.
- Não usar service workers. Não usar backend, base de dados ou contas.
- O Navigator deve funcionar como ficheiro aberto do WhatsApp e como artefacto claude.ai. No artefacto:
- não há fetch a outros domínios;
- um download só funciona através da capacidade downloads;
- a geolocalização está bloqueada.
- Respeitar prefers-reduced-motion. A 360 px não pode haver scroll horizontal.
## 9. Marcos (sem paragem para aprovação)
| Marco | Conteúdo | Verificação própria |
| M1 | Área de trabalho, fontes, CLAUDE.md, script de build | O build gera um HTML vazio válido |
| M2 | Motor do Navigator extraído do v3, com marca configurável, "Faltam X km" e aviso de desvio | O Navigator Meraki gerado é igual ao v3 em conteúdo e comportamento |
| M3 | Biblioteca partilhada: parsers, EXIF, rascunho automático | AC1 e AC2 passam nos testes de unidade |
| M4 | Interface do Studio, com onboarding | Fluxo completo com o GPX Meraki, à mão, no Playwright |
| M5 | Exportação, .roadbook, GPX, lista de verificação | AC6 e AC8 passam |
| M6 | Testes finais, guia de captação, relatório | Todos os AC1–AC10 passam |

## 10. Critérios de aceitação
- AC1. Só a partir do GPX Meraki, o rascunho encontra as 8 entradas da lista de controlo da secção 7, com o km a ±0,2 km, e a zona lenta das pontes. O André chega ao Navigator final em 10 min ou menos.
- AC2. Uma foto com hora fica a 150 m ou menos da posição real. Testar com as 3 fotos Meraki e as horas 10:59 (Cirilu), cerca de 11:10:45 (árvore isolada) e cerca de 11:11:20 (ruínas), hora de Luanda.
- AC2b. Um GPX sem fotos exporta um Navigator completo e utilizável.
- AC3. O Navigator funciona do início ao fim com a rede desligada (teste Playwright offline).
- AC4. A simulação GPS em 8 posições ao longo do trajecto passa. O ponto 1 não é saltado. O aviso de desvio não dispara no trajecto. O aviso dispara a 300 m fora do trajecto. Uma perda breve de sinal não desliga o seguimento.
- AC5. Duas marcas fictícias, uma clara e uma escura, passam o contraste de 4,5:1 nos textos.
- AC6. O Navigator Meraki tem 3 MB ou menos. Não há EXIF nas fotos exportadas.
- AC7. O Navigator não tem controlos de edição nem marca DrakoYuda por omissão.
- AC8. Um .roadbook guardado e reaberto fica idêntico.
- AC9. A 360 px não há scroll horizontal. Os temas claro e escuro funcionam. Há zero erros na consola no Studio e no Navigator.
- AC10. O guia de captação (E4) cabe numa página A4.
- AC11 (fase L, dono André, fora desta sessão). Três pilotos reais, cada um conduzido por um convidado novo. Zero chamadas a pedir direcções.
## 11. Entregáveis em dist/ e docs/
- E1. dist/roadbook-studio.html
- E2. O motor do Navigator, dentro do Studio, e dist/exemplo-navigator-marca-ficticia.html
- E3. dist/chegar-a-meraki-v4.html, gerado no Studio, mais o chegar-a-meraki.roadbook
- E4. docs/guia-de-captacao.md e docs/guia-de-captacao.pdf. Conteúdo:
- as definições do GPS Logger (Android);
- uma app alternativa para iPhone, seleccionada e testada, que exporta GPX com tempos;
- como gravar: começar no asfalto e acabar à porta;
- como fotografar os cruzamentos;
- como enviar as fotos originais.
- E5. docs/RELATORIO-ENTREGA.md: os testes, os resultados, os desvios a este brief, os limites conhecidos e as próximas acções.

Fecho: carregar dist/ e docs/ para a pasta do Drive deste brief. O computador de trabalho não sincroniza o Drive. Se o conector do Drive não estiver disponível, entregar ao André a lista exacta de ficheiros a carregar.
## 12. Fora do âmbito (v1)
- Gravação no browser.
- Várias línguas.
- Contas e sincronização na nuvem.
- Análise de uso.
- Pagamentos.
- Edição da forma do trajecto.
- Alojamento em servidor.
- Uso das mensagens do anfitrião como fonte.
## 13. Riscos
- Uma curva da estrada pode parecer uma manobra. Mitigar com o R-A2 e a confirmação do André.
- O WhatsApp apaga o EXIF. Mitigar com a bandeja do R-S7 e o guia de captação (E4).
- O GPS Logger só existe em Android. Mitigar com a app iOS do E4.
- A posição GPS no ficheiro aberto pelo WhatsApp não está testada num telemóvel real. Registar no E5. Confirmar no AC11.
- O 3D é pesado em telemóveis antigos. O 3D abre só a pedido e volta ao guia se falhar.
- O ficheiro contém a localização de uma casa. Mitigar com o R-S17 e as fotos sem EXIF.
## 14. Decisões registadas (E, 01-11-2026)
- D1. O serviço é feito nos bastidores. A DrakoYuda produz os guias.
- D2. O André é o único utilizador do Studio.
- D3. O Navigator apresenta a marca do anfitrião. O crédito DrakoYuda está desligado por omissão.
- D4. A captação é feita com o GPS Logger. O Studio v1 começa no ficheiro gravado.
- D5. O formato do Navigator é o "Chegar à Meraki" v3.
- D6. O sistema tira o máximo do GPX. O cliente envia o mínimo. O André só confirma.
- D7. O Studio corre como ficheiro local.
