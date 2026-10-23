# Buscador de prácticas · SAMI Osmecon La Matanza

Buscador web de prácticas y valores de los centros de diagnóstico. Se adapta a computadora, tablet y celular.
Filtra mientras escribís, muestra la opción más económica, filtra por centro, ordena e imprime (PDF) hasta 20 ítems.
Tiene un modo administrador para editar la base, importar Excel, aplicar aumentos por centro y publicar los cambios.

No necesita servidor ni una base de datos aparte: la base es el archivo `datos.json` de este repositorio.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La página. |
| `app.js` | Toda la lógica: búsqueda, administrador, importar Excel, aumentos, PDF, publicar. |
| `estilos.css` | Diseño. Los colores están al principio, en `:root`. |
| `datos.json` | **La base de datos**: prácticas, fecha de vigencia e historial de aumentos. |
| `config.js` | Configuración. Solo hace falta tocarlo si usás un dominio propio. |
| `logo.png`, `logo-blanco.png` | Logos para el PDF y el encabezado. |
| `.nojekyll` | Hace que GitHub sirva los archivos tal cual. No lo borres. |

## 1. Subirlo y publicarlo en GitHub Pages

1. En GitHub, tocá **New repository**. Ponele un nombre, por ejemplo `buscador-practicas`, y elegí **Public**. Con la cuenta gratuita, Pages solo funciona en repositorios públicos.
2. En el repositorio nuevo, tocá **Add file → Upload files** y arrastrá **todos** los archivos de esta carpeta, incluido `.nojekyll`. Después tocá **Commit changes**.
   - Si tu computadora oculta `.nojekyll`, creálo desde GitHub con **Add file → Create new file**, nombre `.nojekyll`, vacío.
3. Andá a **Settings → Pages**. En *Build and deployment*, elegí **Source: Deploy from a branch**, **Branch: main** y la carpeta **/ (root)**, y tocá **Save**.
4. En 1 o 2 minutos aparece el link: `https://TU-USUARIO.github.io/buscador-practicas/`. Ese es el buscador para compartir.

## 2. Crear la clave del administrador (token de GitHub)

El botón **Administrador** pide una clave de GitHub con permiso para modificar `datos.json`. Para crearla:

1. En GitHub, andá a tu foto → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Completá así:
   - **Token name:** `Buscador admin`
   - **Expiration:** la que prefieras, por ejemplo 1 año. Cuando venza, generás otra.
   - **Repository access:** **Only select repositories** → elegí `buscador-practicas`.
   - **Permissions → Repository permissions → Contents:** **Read and write**. No hace falta ningún otro permiso.
3. Tocá **Generate token** y copiá la clave, que empieza con `github_pat_`. GitHub la muestra una sola vez.
4. En el buscador, tocá **Administrador**, pegá la clave e ingresá. Marcá «Recordar en este equipo» solo en tu computadora.

Si otra persona va a administrar, agregala como colaboradora del repositorio (**Settings → Collaborators**) y que genere su propia clave con los mismos pasos.
**No compartas la clave ni la pegues en archivos del repositorio.**

## 3. Cómo se actualiza la base

- En modo administrador podés agregar, editar o eliminar prácticas, **importar Excel**, **aumentar valores** de un centro y cambiar la **fecha de vigencia**.
- Los cambios quedan marcados como «sin publicar». Al tocar **Publicar cambios**, la página guarda un `datos.json` nuevo en el repositorio, con un commit «Actualiza base…».
- GitHub Pages tarda **1 o 2 minutos** en mostrar la versión nueva a todos.
- Si otra persona publicó después de que abriste la página, aparece un aviso para no pisar sus cambios.
- **Copias y versiones anteriores:** cada publicación queda en el historial de commits del repositorio, y desde ahí se puede volver a cualquier versión. También podés bajar la base en Excel con **Descargar base**.

## 4. Privacidad

En un repositorio público, cualquiera puede ver `datos.json`, con los valores de los convenios. La página tiene una etiqueta que pide a los buscadores no indexarla, pero eso no la vuelve privada. Si los valores no pueden ser públicos, hay dos opciones: GitHub Pages privado (requiere GitHub Enterprise), o un hosting con contraseña, como Cloudflare Pages con Access o Netlify con protección por contraseña.

## 5. Dominio propio (opcional)

En `usuario.github.io/repositorio`, la página detecta sola el usuario y el repositorio. Si usás un dominio propio, completá `config.js`:

```js
window.BUSCADOR_CONFIG = { owner: "tu-usuario", repo: "buscador-practicas", branch: "main", path: "datos.json" };
```

## 6. Probarlo en la computadora

No funciona abriendo `index.html` con doble clic, porque el navegador no deja leer `datos.json` desde un archivo suelto. Para probarlo localmente, abrí una terminal en esta carpeta y ejecutá:

```
python -m http.server 8000
```

Después abrí `http://localhost:8000`.

## Detalles técnicos

- Todo corre en el navegador. Se usan dos librerías desde cdnjs, que se cargan solo cuando se necesitan: SheetJS para importar Excel y pdf-lib para generar el PDF.
- La búsqueda no distingue mayúsculas ni tildes e ignora palabras como «de», «la» o «con». Si escribís solo números, busca por código.
- Para publicar, la página usa la API de Git de GitHub: crea un blob, un árbol y un commit, y mueve la rama. Antes de publicar compara el SHA del `datos.json` que cargó contra el del repositorio, para detectar si alguien publicó en el medio.
