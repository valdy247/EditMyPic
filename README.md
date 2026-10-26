# EditMyPic

Editor de fotografías nativo para iPhone, iPad, Android y web, construido con Expo, React Native y Skia.

## Objetivo

Publicar EditMyPic en la App Store como una aplicación completa, no como una página web envuelta. La interfaz y el procesamiento principal se ejecutan de forma nativa y local en el dispositivo.

## Primera base nativa

- Abrir imágenes desde Fotos
- Tomar fotografías con la cámara
- Brillo, contraste, saturación y blanco y negro
- Rotación y volteo horizontal/vertical
- Historial con deshacer y rehacer
- Renderizado acelerado con Skia
- Exportación PNG de hasta 4096 px mediante el menú Compartir de iOS
- Interfaz adaptable a iPhone y iPad
- Procesamiento local de las imágenes

## Publicación sin Mac

La compilación y firma de iOS se harán en la nube con Expo Application Services (EAS). El propietario solo necesitará autorizar sus cuentas de Expo y Apple Developer desde el navegador. No será necesario instalar Xcode ni ejecutar compilaciones en una computadora personal.

## Distribución prevista

1. Builds internas mediante EAS.
2. Pruebas en iPhone con TestFlight.
3. Capturas, privacidad y ficha de App Store Connect.
4. Envío a revisión de Apple.

## Identificador provisional

`com.valdy247.editmypic`


## AI Video Studio para PC (web)

La ruta web `/` y `/video` ahora presentan un estudio de video pensado para navegadores de escritorio. La pantalla nativa `app/video.tsx` permanece intacta; Expo Router utiliza `app/video.web.tsx` solo en web.

### Desarrollo local

1. Instala las dependencias con `npm ci` (Node 22 o superior).
2. Configura `EXPO_PUBLIC_EDIT_API_URL` con la URL HTTPS del servidor Expo que expone `/api/v1/video`, o déjala sin configurar si la web y la API se sirven desde el mismo origen.
3. Ejecuta `npm run web` y abre la dirección local que indique Expo.
4. La variable `RUNWAYML_API_SECRET` debe existir **solo en el servidor**; nunca la coloques en el código web ni uses el prefijo `EXPO_PUBLIC_`.

### Funciones web

- Carga de imágenes JPG/PNG/WebP con compresión en el navegador si exceden el límite del backend.
- Prompts de hasta 1,000 caracteres, Kling 3.0 Pro + audio o Runway Gen-4.5, duración 5/10 segundos y formato vertical/horizontal.
- Consulta automática de tareas y reproductor con enlace para abrir/guardar el resultado.
- Historial de hasta 30 tareas en `localStorage` del navegador, sin borrar la anterior al iniciar otra generación.
- Recuperación de una tarea de Runway pegando su ID (si sigue accesible desde la misma cuenta API).

**Importante:** El historial web es local a ese navegador; no se sincroniza con iPhone ni almacena los archivos MP4. Los enlaces de video de Runway pueden expirar: descarga los videos terminados.

### Antes de publicar para usuarios

El endpoint actual `/api/v1/video` no requiere autenticación. **No se debe abrir una web de generación al público sin añadir autenticación y límites de uso en el backend**, porque las solicitudes consumen créditos. El estudio web de esta rama es una base de desarrollo; no implica despliegue público ni que se hayan validado generaciones reales.
