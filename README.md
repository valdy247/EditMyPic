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
