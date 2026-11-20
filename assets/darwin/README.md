# Darwin V8 — modelo 3D

Esta pasta guarda a fonte editável do Darwin V8 e os scripts para recriar os arquivos do app.

- `darwin-v8-mascot.blend`: projeto editável do Blender, com a geometria, materiais e animações.
- `darwin-v8-blender.py`: gera novamente a cena e o arquivo `.blend`.
- `export-darwin-v8-glb.py`: exporta a cena como GLB para o app.
- `../../public/darwin/darwin-v8-mascot.glb`: modelo otimizado que o navegador carrega.

O GLB inclui os clips `L floating green hand moduleAction`, `L hand module highlightAction`, `Target contact pulseAction`, `Target markAction` e `Touch targetAction`. O componente `components/darwin-model-scene.tsx` consome essas animações.

## Regenerar

Com Blender instalado e o exportador glTF habilitado, execute na raiz do repositório:

```powershell
blender --background --python assets/darwin/darwin-v8-blender.py
blender --background --python assets/darwin/export-darwin-v8-glb.py
```

O primeiro comando recria o arquivo Blender sem renderizar centenas de quadros. Para gerar a sequência de quadros, defina `DARWIN_RENDER=1`; imagens renderizadas ficam em `assets/darwin/renders/` e não são versionadas.
