# FrameXTV — plugin de Kino

Plugin para [Kino](https://github.com/kinotvapp) que trae **películas, series y anime** de frameXTV:

- Catálogo con datos de **TMDB**: búsqueda, filas de Inicio por categorías (películas, series, anime, estrenos), "Ver más" con páginas y temporadas/capítulos de cada serie.
- Video por los servidores que usa frameXTV (CineJoy via `api.wing.st` y Movy via `api.wecollege.net`), entregado siempre por el proxy propio del sitio (`frappe.hybrows.workers.dev`), con calidades hasta 4K y varias pistas de audio.
- Menú "Servidor" en el reproductor con copias etiquetadas (Lisbon, Nebula, Athens, Solara, Movy): si una falla, Kino pasa a la siguiente sola.
- Descargas para ver sin conexión (películas y capítulos en HLS normal).
- Instala en Kino: **Plugins → +** y escribe `baskettv23/kino-plugin-framextv`.

No necesita cuenta ni clave alguna; en Kino 0.9.52 o anterior (sin `kino.tmdb`) puedes pegar tu propia clave de TMDB en Ajustes del plugin.

## Desarrollo

```
node sdk/validate.mjs .                     # valida el manifiesto y las respuestas
node sdk/run.mjs . search "inception"       # prueba una función contra la fuente
node sdk/run.mjs --record test/fixtures-movie.json . resolve "f:27205"   # graba una respuesta
node --test test/plugin.test.mjs            # prueba sin conexión
```

`test/tmdb-fixture.json` sustituye a TMDB en las pruebas; los fixtures de `test/fixtures-*.json` son respuestas grabadas de los servidores de video. `sdk/` es el kit de pruebas de Kino (no lo modifiques).

Licencia: ve LICENSE (heredada de la plantilla de Kino).
