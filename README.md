# ERP Mundo 3D

Página web (e instalable como app en el celular) del ERP de **Mundo 3D**, **Merchy Prints** y **Nathan3D**.

- **La página** se publica con GitHub Pages desde este repositorio. Aquí no hay ningún dato del negocio.
- **Los datos** viven en la hoja de Google *ERP Mundo 3D - Datos*, en el Drive de Mundo 3D. Cada pestaña es una colección: `pedidos`, `clientes`, `gastos`, `inventario`, `freelance`.
- **La conexión** entre la página y la hoja es el script de `apps-script/Codigo.gs`, instalado en la hoja como aplicación web. Pide una clave para entrar.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | El ERP (pantallas, tableros, formularios) |
| `sheetdb.js` | Lee y guarda los datos en la hoja de Google |
| `config.js` | Dirección (URL) de la aplicación web de Apps Script |
| `apps-script/Codigo.gs` | Código que se pega en la hoja (Extensiones → Apps Script) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Lo que permite instalarla como app en el celular |

## Instalar en el celular

- **Android (Chrome):** abre la página → menú ⋮ → *Instalar app* o *Agregar a pantalla principal*.
- **iPhone (Safari):** abre la página → botón Compartir → *Agregar a inicio*.
