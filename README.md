# La despensa · VikingsProyect

Guía de comidas e hidromieles de Valheim 1.0 para el servidor **Villa de Lujan**, con lo que hay en los cofres de la casa.

Página: https://zotad.github.io/VikingsProyect/

## Cómo se actualiza

Un workflow de GitHub Actions (`.github/workflows/actualizar.yml`) corre cada hora en punto, de 9 a 23 (hora de Argentina):

1. `bajar_mundo.py` baja la carpeta del mundo desde DatHost por su API.
2. `leer_cofres.py` lee los cofres de la casa y genera `stock.js`.
3. `build_artifact.py --standalone` arma una sola página con todo embebido y la publica en GitHub Pages.

Para actualizar a mano: pestaña **Actions** → **Actualizar la despensa** → **Run workflow**, o `gh workflow run actualizar.yml`.

## Secretos

En **Settings → Secrets and variables → Actions** tienen que estar `DATHOST_EMAIL` y `DATHOST_PASSWORD` (la cuenta de DatHost). Sin ellos la página se publica igual, pero sin la sección de la casa.

## Local

`abrir.bat` levanta la página en http://localhost:5190 con `serve.py`. La casa se configura en `CASA_CHUNKS` dentro de `leer_cofres.py`.

Datos e imágenes: wiki de Valheim en Fandom.
