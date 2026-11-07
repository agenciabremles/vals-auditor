# vals-auditor

Generador de informes de salud web para prospectos de **VAL'S Digital Solutions**.
Cada informe es de **1 página (US Letter), en inglés, con tu marca**, listo para enviar al cliente.

**No necesita claves de API ni cuentas de pago.** Corre Lighthouse (Google) dentro de GitHub Actions.

## Qué hace

Por cada sitio web:

1. **Lighthouse en móvil** (velocidad, SEO, accesibilidad, buenas prácticas), promedio de 2 pruebas.
2. **Revisiones para negocios locales** que Lighthouse no hace: botón de llamada, formulario, botón de cotizar/agendar, reseñas, mención de la zona, datos locales para Google, mapa, año del copyright, etc.
3. **Informe PDF + HTML** con los 5 problemas principales, lo que ya funciona y una recomendación según el oficio (cotizador, agendador, menú QR…).
4. **`summary.csv`** con todos los prospectos ordenados por **oportunidad** (0-100; más alto = más margen de mejora). Es uso interno, no aparece en el informe.

## Uso

### Desde GitHub (recomendado)

1. Pestaña **Actions** → **Audit websites** → **Run workflow**.
2. Pega una o varias URLs separadas por coma, o déjalo vacío para auditar todo `prospects.csv`.
3. Al terminar, abre la ejecución y descarga el artefacto **vals-audit-reports**
   (una carpeta por sitio con `report.pdf`, `report.html`, `result.json`, más `summary.csv`).
   La tabla resumen también aparece en la página de la ejecución.

### En tu computador (opcional)

```bash
npm install
node audit.mjs --urls https://ejemplo.com
node audit.mjs                       # usa prospects.csv
```

Requiere Node 20+ y Google Chrome instalado. Opciones: `--runs 3`, `--no-pdf`, `--out carpeta`.

## Antes del primer envío

- Completa **`config.json`** → `contact` (teléfono, correo, web). Sin eso, el pie del informe no dice cómo contactarte.
- Llena **`prospects.csv`**: `url,name,trade,city,notes`.
  - `trade` define la recomendación (roofing, plumbing, salon, restaurant, dental, cleaning…).
  - `city` (ej. Exton) se usa para revisar si el sitio menciona la zona.
  - `notes` aparece en el informe como "A note from us". Úsalo para personalizar.
- **Lee cada informe antes de enviarlo.** Es una auditoría automática; una revisión de 30 segundos y una nota personal marcan la diferencia.

## Notas

- Los puntajes de Lighthouse varían un poco entre pruebas; por eso se promedian.
- Una ejecución tarda aprox. 1-2 minutos por sitio.
- Repositorio privado: los repos privados gratuitos tienen una cuota mensual de minutos de Actions; auditar decenas de sitios al mes cabe de sobra.
- El informe usa datos de laboratorio, no datos reales de usuarios (para eso haría falta la API de PageSpeed con clave; es opcional y se puede añadir después).

## Estructura

```
audit.mjs              # programa principal
config.json            # marca y contacto
prospects.csv          # lista de prospectos
lib/checks.mjs         # revisiones de negocio local
lib/lighthouse.mjs     # ejecuta Lighthouse
lib/findings.mjs       # hallazgos en lenguaje simple, prioridad, recomendación
lib/report.mjs         # plantilla del informe de 1 página
assets/logo.png        # logo VAL'S
.github/workflows/     # flujo de GitHub Actions
```
