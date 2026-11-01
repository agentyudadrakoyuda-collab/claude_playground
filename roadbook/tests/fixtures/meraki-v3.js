/* Dados de controlo do "Chegar à Meraki" v3 (textos dos 8 pontos, gatilhos, estrada de acesso).
   Copiados de sources/chegar-a-meraki-v3.html. Negrito em **…** (o Studio converte em <strong>). */
'use strict';
const geo = require('../../sources/v3-geometria.json');
module.exports = {
  title: 'Chegar à Meraki', place: 'Meraki', recorded: '2026-11-01',
  roadLabels: ['Luanda', 'Caxito'], road: geo.ROAD,
  welcome: 'Venha pela estrada de Luanda em direcção a Caxito. A picada começa no **Cirilu**, um prédio redondo inacabado. Daí até à Meraki são 7,6 km de terra batida.',
  before: 'Lá não há rede. **Abra este guia em casa** e deixe-o aberto, ou guarde-o no telemóvel.',
  notes: ['Pelo caminho passam **duas pontes pequenas**. É normal, siga em frente.'],
  /* entradas de controlo da secção 7 do brief (km a→b) */
  control: [
    { n: 1, a: 0.0, b: 0.0, kinds: ['inicio'], label: 'Cirilu, vire à esquerda' },
    { n: 2, a: 0.0, b: 2.7, kinds: ['troco'], label: 'recta longa' },
    { n: 3, a: 2.7, b: 2.7, kinds: ['manobra'], sides: ['esquerda', 'direita'], label: 'esquerda e logo direita' },
    { n: 4, a: 2.8, b: 4.6, kinds: ['subida'], label: 'subida de cerca de 30 m' },
    { n: 5, a: 4.7, b: 4.7, kinds: ['manobra'], sides: ['esquerda'], label: 'vire à esquerda' },
    { n: 6, a: 5.3, b: 5.4, kinds: ['manobra'], sides: ['direita'], label: 'curva à direita junto à árvore isolada' },
    { n: 7, a: 5.5, b: 5.9, kinds: ['manobra'], sides: ['esquerda'], label: 'ruínas, bifurcações sempre à esquerda' },
    { n: 8, a: 6.0, b: 7.6, kinds: ['descida', 'chegada'], label: 'descida, duas curvas à direita, chegada' }
  ],
  slow: { a: 2.7, b: 2.9 },
  steps: [
    { a: 0, b: 0, title: 'Cirilu: vire à esquerda', m: 'esquerda',
      text: 'Na estrada de Luanda para Caxito, procure o **Cirilu**: um prédio redondo de betão, inacabado, do lado direito. **Vire à esquerda** para a picada, mesmo em frente a ele.',
      img: 'cirilu', cap: 'O Cirilu, visto da entrada da picada.' },
    { a: 0, b: 2.7, title: 'A recta longa', m: 'em frente',
      text: 'Siga **sempre em frente**, para norte, pelo meio das lavras. São cerca de 2,7 km, uns 6 minutos.' },
    { a: 2.7, b: 2.8, title: 'Esquerda e logo direita', m: 'esquerda',
      text: 'No fim da recta, **vire à esquerda** e, logo a seguir, **à direita**. A picada atravessa um vale pequeno.' },
    { a: 2.8, b: 4.6, title: 'Subida para o planalto', m: 'em frente', text: 'A picada sobe cerca de 30 m. Siga o caminho principal.' },
    { a: 4.7, b: 4.7, title: 'Vire à esquerda', m: 'esquerda', text: 'Já em cima, no planalto, **vire à esquerda**.' },
    { a: 5.3, b: 5.4, title: 'Árvore isolada', m: 'direita',
      text: 'Terreno aberto e lavrado, com montes de areia à esquerda. A picada **curva à direita** junto a uma árvore isolada.',
      img: 'planalto', cap: 'A curva junto à árvore isolada.' },
    { a: 5.5, b: 5.9, title: 'Ruínas à esquerda', m: 'esquerda',
      text: 'Passa por uma casa em ruínas do **lado esquerdo**. Nas bifurcações a seguir, **sempre à esquerda**.',
      img: 'ruinas', cap: 'As ruínas, do lado esquerdo da picada.' },
    { a: 6.0, b: 7.58, title: 'Descida até à Meraki', m: 'chegada', home: true,
      text: 'A picada desce até à casa. No fim há **duas curvas à direita**. Chegou à Meraki. Bem-vindos!' }
  ],
  trig: [-1, 0.15, 2.6, 2.85, 4.6, 5.2, 5.45, 6.0],
  /* AC2: horas das fotos (hora de Luanda, UTC+1) e posição real (waypoints do v3) */
  photos: [
    { key: 'cirilu', time: '2026:11:01 10:59:00', real: { lat: -8.60391, lon: 13.58009 } },
    { key: 'planalto', time: '2026:11:01 11:10:45', real: { lat: -8.5625, lon: 13.57436 } },
    { key: 'ruinas', time: '2026:11:01 11:11:20', real: { lat: -8.56018, lon: 13.57257 } }
  ]
};
