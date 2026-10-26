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

La ruta web `/` y `/video` ahora presentan un estudio de video pensado para navegadores de escritorio. La pantalla nativa `app/video.tsx` sigue disponible con inicio de sesión privado. Expo Router utiliza `app/video.web.tsx` solo en web. La edición de fotos sin IA continúa funcionando sin iniciar sesión.

### Desarrollo local

1. Instala las dependencias con `npm ci` (Node 22 o superior).
2. Configura `EXPO_PUBLIC_EDIT_API_URL` con la URL HTTPS del servidor Expo que expone `/api/v1/video`, o déjala sin configurar si la web y la API se sirven desde el mismo origen.
3. Ejecuta `npm run web` y abre la dirección local que indique Expo.
4. Configura las variables de servidor `EDITMYPIC_PRIVATE_PASSWORD` (mínimo 20 caracteres) y `EDITMYPIC_SESSION_SECRET` (mínimo 32 caracteres), además de `RUNWAYML_API_SECRET` y, si usas Borrar objetos, `OPENAI_API_KEY`. **Nunca** uses el prefijo `EXPO_PUBLIC_` para secretos.

### Funciones web

- Carga de imágenes JPG/PNG/WebP con compresión en el navegador si exceden el límite del backend.
- Prompts de hasta 1,000 caracteres, Kling 3.0 Pro + audio o Runway Gen-4.5, duración 5/10 segundos y formato vertical/horizontal.
- Consulta automática de tareas y reproductor con enlace para abrir/guardar el resultado.
- Historial de hasta 30 tareas en `localStorage` del navegador, sin borrar la anterior al iniciar otra generación.
- Recuperación de una tarea de Runway pegando su ID (si sigue accesible desde la misma cuenta API).

**Importante:** El historial web es local a ese navegador; no se sincroniza con iPhone ni almacena los archivos MP4. Los enlaces de video de Runway pueden expirar: descarga los videos terminados.

### Seguridad privada

- El sitio web muestra una pantalla de acceso antes de permitir el estudio. Las API de generación de video, consulta de tareas y borrado de objetos requieren una sesión válida.
- El servidor firma sesiones con HMAC SHA-256; el navegador usa cookie HttpOnly, SameSite=Strict y Secure en HTTPS. El cliente nativo usa un token temporal solo en memoria (sin guardar la contraseña).
- Las sesiones duran 12 horas. El historial web es local al navegador y **no** es una copia de seguridad de videos.
- El servidor no funciona si faltan las dos variables de acceso privado o son demasiado cortas.
- El limitador de intentos es en memoria y no se comparte entre instancias: para mayor seguridad en producción conviene activar reglas de acceso/WAF en el hosting.
- `.env` ya no está versionado. Si anteriormente se subieron claves reales al repositorio, hay que rotarlas: borrarlas del último commit no elimina su historial.
- No expongas la contraseña ni el secreto de sesión en GitHub, capturas, logs, frontend ni chats.

### Publicación segura con EAS Hosting

1. En el proyecto Expo de EditMyPic, configura en **Production** las variables `EDITMYPIC_PRIVATE_PASSWORD`, `EDITMYPIC_SESSION_SECRET`, `RUNWAYML_API_SECRET` y, si corresponde, `OPENAI_API_KEY`. Usa visibilidad **Sensitive** para EAS Hosting.
2. Configura también las variables equivalentes en **Preview** para pruebas, usando una contraseña y secreto de sesión diferentes a Production.
3. En una computadora con Node 22 y Expo CLI, ejecuta `npm ci`, `npm run typecheck`, `npx expo export --platform web` y `eas deploy --environment preview`. Comprueba la URL de preview sin usar créditos reales hasta verificar acceso y generación.
4. Verifica que los endpoints devuelvan 401 sin sesión, que el login correcto permita usar la web, que la sesión caduque, y que el iPhone actualizado pueda iniciar sesión y usar las herramientas de IA.
5. **Antes de desplegar a Production**, distribuye una nueva versión de iPhone compatible con el login. Las versiones antiguas no podrán llamar a las API protegidas. Coordina el cambio.
6. Después de aprobar las pruebas, exporta y publica con `eas deploy --environment production` y comprueba `https://editmypic.expo.app`.

**Estado:** código preparado en una rama de desarrollo. Aún requiere typecheck, pruebas funcionales y configuración privada en EAS. No equivale a una publicación completada.


### Flujo de publicación Production (sin Preview)

Se añadió `.eas/workflows/deploy-production.yml`. Este flujo **solo se ejecuta manualmente**: primero comprueba TypeScript, ejecuta pruebas de autenticación y exporta la web; únicamente si todas las verificaciones pasan, publica en EAS Hosting usando las variables de **Production**.

**Antes de ejecutarlo:** confirmar que `EDITMYPIC_PRIVATE_PASSWORD`, `EDITMYPIC_SESSION_SECRET`, `RUNWAYML_API_SECRET` y `OPENAI_API_KEY` (si se usa Borrar objetos) existen en Production. Confirmar que los clientes iPhone en uso ya tienen soporte para el login privado, o las generaciones de las versiones antiguas dejarán de funcionar tras la publicación.

Desde una copia actualizada del repositorio con los cambios integrados y la sesión Expo iniciada, ejecutar `eas workflow:run .eas/workflows/deploy-production.yml`. No se ha ejecutado este comando ni desplegado esta rama desde el chat. Los trabajos fallidos de GitHub Actions aún no permiten afirmar que la aplicación compile.
