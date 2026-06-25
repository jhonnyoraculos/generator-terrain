# Terrain Forge

Terrain Forge e um gerador procedural de montanhas, morros, vales e terrenos 3D para uso em Unity, Blender e outras engines. O app roda 100% no navegador, sem backend, usando Vite, React, TypeScript e Three.js.

## Requisitos

- Node.js 18 ou superior
- npm 9 ou superior

## Como rodar

```bash
npm install
npm run dev
```

Abra o endereco mostrado pelo Vite, normalmente:

```text
http://localhost:5173
```

Para gerar uma build de producao:

```bash
npm run build
```

Para testar a build localmente:

```bash
npm run preview
```

## Deploy na Netlify

O projeto ja inclui `netlify.toml`.

Na Netlify:

1. Crie um novo site a partir do repositorio GitHub.
2. Use estas configuracoes:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node version: `20`
3. Publique o site.

A Netlify vai instalar as dependencias, executar o build do Vite e servir a pasta `dist`.

## O que o app exporta

- `terrain.obj`: malha triangulada, centralizada na origem, em escala real e com UVs `0..1`.
- `terrain.mtl`: material OBJ que aponta para a textura bakeada e o normal map.
- `terrain.glb`: versao GLB com material simples e cores por altura quando ativadas.
- `heightmap.png`: heightmap 8-bit para preview e ferramentas gerais.
- `heightmap.r16`: RAW 16-bit little-endian normalizado de `0` a `65535`.
- `normalmap.png`: normal map combinado a partir do relevo, dos normals por textura e do normal global de detalhe.
- `terrain_texture.png`: textura unica bakeada do terreno, com as camadas misturadas por altura e inclinacao.
- `textures/`: texturas originais carregadas pelo usuario quando exportadas no ZIP.
- `metadata.json`: seed, dimensoes, resolucao, altura, exagero vertical e parametros usados.
- `terrain-forge-export.zip`: pacote com todos os arquivos acima.

## Parametros principais

- `seed`: controla a geracao deterministica. O mesmo seed com os mesmos parametros gera o mesmo terreno.
- `largura` e `profundidade`: tamanho da malha em unidades.
- `resolucao`: quantidade de vertices por eixo. Para Unity Terrain RAW, prefira `33`, `65`, `129`, `257` ou `513`.
- `altura maxima`: escala vertical base antes do exagero vertical do preview/export.
- `noise scale`, `octaves`, `persistence`, `lacunarity`: controlam a estrutura do noise FBM.
- `montanhas`, `morros`, `vales`, `planicie`: misturam formas grandes, ondulacoes, canais e areas planas.
- `suavizacao` e `erosao`: filtram o relevo para reduzir ruido quebrado e simular deposicao simples.
- `falloff nas bordas`: cria ilhas ou terrenos isolados.
- `exagero vertical`: multiplica a altura usada na visualizacao e exportacao de malha.

## LOD no preview

O preview 3D usa um sistema de LOD dinamico quando ativado. Ele cria versoes reduzidas da malha para distancias maiores da camera, melhorando FPS em terrenos densos.

- LOD 0: normalmente a malha completa do terreno.
- LOD 1, LOD 2 e LOD 3: versoes progressivamente mais leves.
- Cada LOD tem resolucao propria, distancia de entrada, campo de poligonos alvo e contador estimado de vertices/poligonos no painel.
- O campo `Preview LOD` permite forcar Auto, LOD 0, LOD 1, LOD 2 ou LOD 3 para inspecionar a malha de cada nivel.

Isso afeta apenas a visualizacao no navegador. OBJ, GLB, heightmap e RAW continuam exportando a resolucao configurada do terreno.

## Texturas

A aba `Texturas` permite carregar imagens locais para:

- diffuse e normal map de grama / vegetacao
- diffuse e normal map de terra / solo exposto
- diffuse e normal map de pedra / encosta
- diffuse e normal map de neve / topo claro
- normal de detalhe global opcional

O app mistura as texturas por altura e inclinacao do terreno e gera um `terrain_texture.png` bakeado. Esse arquivo usa o UV `0..1` da propria malha, entra no ZIP e tambem pode ser incorporado no GLB.

No preview, o normal map geral do terreno e aplicado automaticamente no material. Os normal maps de cada camada usam as mesmas mascaras de altura/inclinacao da textura difusa, entao pedra, terra, grama e neve entram no relevo visual nos lugares corretos. A aba `Texturas` tambem permite ajustar a forca do normal do terreno, a forca dos normals carregados e a variacao macro usada para quebrar repeticao visual.

O ZIP tambem inclui `terrain.mtl`, que referencia:

- `terrain_texture.png` como textura difusa.
- `normalmap.png` como normal/bump map geral do terreno.

Mesmo sem carregar texturas, o app gera automaticamente uma textura unica baseada nas cores por altura e no relevo.

## Como importar na Unity

### Importar OBJ como mesh

1. Exporte `terrain.obj` ou o ZIP.
2. Arraste `terrain.obj` para a pasta `Assets` do projeto Unity.
3. Se usar o ZIP, mantenha `terrain.obj`, `terrain.mtl`, `terrain_texture.png` e `normalmap.png` na mesma pasta.
4. Selecione o asset e confira a escala. O OBJ sai centralizado na origem, com `1 unidade do app = 1 unidade Unity`.
5. Crie um material na Unity usando `terrain_texture.png` como Base Map e `normalmap.png` como Normal Map.

### Importar heightmap R16 em Terrain

1. Use uma resolucao compativel com Unity Terrain: `33`, `65`, `129`, `257` ou `513`.
2. Exporte `heightmap.r16` ou o ZIP.
3. Na Unity, crie um `Terrain`.
4. No componente Terrain, use `Import Raw...`.
5. Selecione `heightmap.r16`.
6. Configure:
   - Bit Depth: `16 bit`
   - Byte Order: `Windows / Little Endian`
   - Width e Height: o valor de `resolution` em `metadata.json`
   - Flip Vertically: ajuste conforme a orientacao desejada no projeto
7. Ajuste o tamanho do Terrain:
   - Width: `width` do `metadata.json`
   - Length: `depth` do `metadata.json`
   - Height: `heightMax * verticalExaggeration`

### Repetir escala e parametros

O arquivo `metadata.json` guarda:

- `seed`
- `width`
- `depth`
- `resolution`
- `heightMax`
- `verticalExaggeration`
- todos os parametros do gerador

Use esses valores para reconstruir a escala no Terrain da Unity ou para repetir o terreno no app com o mesmo seed.

## Presets incluidos

- Morros suaves
- Serra mineira
- Minas - mar de morros
- Montanhas altas
- Vale profundo
- Ilha montanhosa
- Terreno para jogo mobile
- Terreno realista para PC

## Notas de performance

- A geracao roda em Web Worker para manter a interface responsiva.
- Sliders usam debounce antes de recalcular o terreno.
- O preview tem LOD dinamico e overlay de FPS, vertices, triangulos e draw calls.
- Resolucao `257` costuma ser um bom equilibrio para PC.
- Resolucao `513` gera mais de 263 mil vertices e pode demorar para exportar OBJ/GLB/ZIP.
