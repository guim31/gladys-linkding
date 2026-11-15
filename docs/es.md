# linkding

Conecte Gladys a [linkding](https://linkding.link), el gestor de marcadores
autoalojado: siga sus contadores (marcadores, no leídos, archivados), vea sus
marcadores no leídos en el panel, reaccione cuando se añade un marcador, lea
los más recientes en un mensaje y, si lo autoriza, guarde enlaces desde sus
escenas. Todo se queda en su red local: Gladys habla directamente con su
servidor linkding.

Probado con un servidor linkding 1.47.0 real (la imagen Docker oficial). Sus
comentarios son bienvenidos en el foro de Gladys.

## Requisitos previos

- Gladys Assistant 5.1 o posterior.
- linkding, accesible desde la máquina de Gladys, en el puerto 9090 por
  defecto, o detrás de un proxy inverso.
- Un token de API: en linkding, abra **Settings → Integrations** y cree un
  token en la sección **REST API**. La integración ve los marcadores del
  usuario propietario del token.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. En **Dirección de linkding**, introduzca la dirección IP del servidor, por
   ejemplo `192.168.1.50`: la integración usa entonces el puerto 9090. Añada
   un puerto si el suyo es otro (`192.168.1.50:9091`). Detrás de un proxy
   inverso, introduzca la dirección completa (`https://enlaces.example.org`,
   con su ruta si linkding se sirve bajo una ruta).
3. Pegue el **Token de API**.
4. **Filtros (opcional)**: una **Etiqueta** (`leer`) y/o una **Búsqueda**
   (palabras, como en el campo de búsqueda de linkding). Los contadores, el
   widget, el disparador **Nuevo marcador** y **Leer los últimos marcadores de
   linkding** solo tienen en cuenta entonces los marcadores que coinciden.
   Deje ambos vacíos para todos los marcadores.
5. **Leer linkding cada**: 5, 15 (por defecto), 30 o 60 minutos.
6. **Permitir que las escenas añadan marcadores**: desactivado por defecto.
   Actívelo para usar la acción de escena **Añadir un marcador a linkding**.
7. **Idioma de nombres y mensajes** fija los nombres de las funciones (fijados
   al añadir el dispositivo) y los textos de la integración. Francés por
   defecto.
8. Guarde y use **Probar la conexión**: muestra la versión de linkding y el
   número de marcadores.
9. En la pestaña **Descubrimiento**, añada el dispositivo **linkding**.

## Dispositivos

**linkding** (un dispositivo):

| Función               | Valor                                                     |
| --------------------- | --------------------------------------------------------- |
| Servidor accesible    | 1 cuando linkding responde, 0 si no                       |
| Marcadores            | número de marcadores, sin los archivados                  |
| Marcadores no leídos  | número de marcadores marcados como no leídos              |
| Marcadores archivados | número de marcadores archivados                           |
| Último marcador       | título del marcador más reciente (sin título: su dominio) |
| Versión de linkding   | versión del servidor, por ejemplo 1.47.0                  |

Los filtros de la configuración se aplican a los tres contadores y al último
marcador. Los contadores guardan su historial: un gráfico muestra cómo crece
su pila de lectura. Cuando linkding no responde, **Servidor accesible** pasa a
0 y los contadores conservan su último valor.

## Widget del panel

**linkding**: dos casillas (no leídos, marcadores) y los seis marcadores no
leídos más recientes, con su dominio, fecha y etiquetas. Toque un marcador
para leer su descripción y abrirlo (solo enlaces https). En los ajustes del
widget, **Lista** muestra en su lugar los últimos marcadores (los no leídos
llevan entonces una insignia **Sin leer**), y **Mostrar los contadores**
oculta las dos casillas.

## Disparadores de escena

**Nuevo marcador**: se añade a linkding un marcador que coincide con los
filtros de la configuración, desde la aplicación web, la extensión del
navegador o la API. Las importaciones (cuyos marcadores conservan sus fechas
antiguas) y los marcadores guardados por esta integración no se anuncian.

Variables: **Título**, **Enlace**, **Descripción**, **Etiquetas** (separadas
por comas), **Sin leer** e **Id. del marcador**.

La primera lectura tras la instalación es silenciosa: los marcadores ya
presentes no se anuncian. Se envían como máximo diez eventos por lectura; el
resto se cuenta como visto.

## Acciones de escena

- **Añadir un marcador a linkding** (active antes **Permitir que las escenas
  añadan marcadores**): **Enlace** (obligatorio) y, si lo desea, **Título**
  (vacío: linkding lee el título de la página), **Etiquetas** (separadas por
  espacios o comas; las que faltan se crean) y **Marcar como no leído**. Un
  enlace que ya está en linkding se deja tal cual (linkding reemplazaría si no
  su título y sus etiquetas). Devuelve **Id. del marcador**, **Título** y **Ya
  guardado**.
- **Leer los últimos marcadores de linkding**: **Marcadores** (solo no leídos,
  por defecto, o todos) y **Número de marcadores** (1, 3, 5 o 10). Devuelve
  **Número de marcadores leídos**, **Marcadores, uno por línea** (`título —
dirección`), **Título del marcador más reciente** y **Dirección del marcador
  más reciente**.

## Ejemplos de escenas

- **Nueva lectura en el móvil**: disparador **Nuevo marcador** → enviar un
  mensaje «Para leer: {{triggerEvent.data.title}} {{triggerEvent.data.url}}».
- **Lectura del domingo**: cada domingo a las 10:00 → **Leer los últimos
  marcadores de linkding**, solo no leídos, 5 marcadores → enviar un mensaje
  con la salida **Marcadores, uno por línea**.
- **Guardar el clip de la cámara**: cuando otra integración da la dirección
  de un clip → **Añadir un marcador a linkding** con esa dirección, etiqueta
  `timbre`.
- **Pila de lectura**: cada noche → continuar solo si **Marcadores no leídos**
  supera 30 → enviar un mensaje «Su pila de lectura supera los 30
  marcadores».
- **Servidor caído**: **Servidor accesible** pasa a 0 → enviar un mensaje.

## Solución de problemas

- **«linkding rechazó el token de API»**: el token se eliminó o se escribió
  mal. Cree uno nuevo en linkding → Settings → Integrations.
- **«linkding no responde»**: compruebe la dirección y el puerto desde la
  máquina de Gladys. El contenedor usa una red en puente: `localhost` es el
  propio contenedor, introduzca en su lugar la dirección IP del servidor.
- **«Esta dirección no responde como linkding»**: una página de inicio de
  sesión del proxy responde en lugar de linkding, o la ruta es incorrecta.
  Introduzca la dirección del propio linkding.
- **«Añadir marcadores desde escenas está desactivado»**: active **Permitir
  que las escenas añadan marcadores** en la configuración.
- Para ver más detalles en los registros de la integración, configure
  `LOG_LEVEL=debug`.

## Límites

- Un solo usuario de linkding: el propietario del token.
- El disparador se activa en la siguiente lectura (15 minutos por defecto), no
  al instante: linkding no envía nada por sí mismo. Lee los 50 marcadores más
  recientes: si se añaden más de 50 entre dos lecturas, los más antiguos no se
  anuncian.
- Un marcador añadido ya archivado se cuenta pero no se anuncia.
- La integración nunca borra, modifica ni archiva nada en linkding.
- Sin relación con el proyecto linkding.
