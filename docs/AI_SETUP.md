# EditMyPic — Fondo y Borrar con Expo

EditMyPic ya no utiliza Vercel. La aplicación, el servidor de edición y las builds viven dentro del ecosistema Expo.

## Fondo: funciona dentro del iPhone

`Fondo > Quitar fondo` usa Apple Vision en el dispositivo. También funcionan localmente:

- fondo transparente;
- color sólido;
- degradados;
- otra fotografía;
- fondo desenfocado;
- suavizado de bordes;
- sombra del sujeto.

Estas herramientas necesitan una build nativa nueva, pero no necesitan una clave de OpenAI ni EAS Hosting.

## Borrar: usa una API Route de Expo

`Borrar` envía una copia temporal de la composición y la máscara pintada a:

```text
app/api/v1/erase+api.ts
```

La ruta se despliega en EAS Hosting durante la build de producción. La app llama a `/api/v1/erase`, por lo que no hay que copiar ni mantener una URL pública en Expo Launch.

## Única variable privada

En el panel del proyecto Expo, crea esta variable para el entorno `Production`:

```text
OPENAI_API_KEY
```

Usa visibilidad `Sensitive`. EAS Hosting permite variables Plain text y Sensitive para sus API Routes; las variables marcadas como Secret no se incluyen en despliegues de Hosting.

La clave nunca debe añadirse a `app.json`, GitHub, una variable `EXPO_PUBLIC_` ni al código de la aplicación.

## Activación desde el navegador

1. Abre el proyecto EditMyPic en expo.dev.
2. Entra en `Hosting` y activa EAS Hosting una sola vez.
3. Elige un subdominio disponible para el proyecto.
4. Entra en `Project settings > Environment variables`.
5. Añade `OPENAI_API_KEY` para `Production` con visibilidad `Sensitive`.
6. Crea un Launch nuevo desde la rama `main`.

`eas.json` ya activa `EXPO_UNSTABLE_DEPLOY_SERVER=1`. Durante la build, Expo despliega una versión del servidor y enlaza automáticamente la aplicación nativa con esa misma versión.

## Privacidad

- Quitar o cambiar fondo se procesa localmente.
- Borrar personas u objetos usa OpenAI y requiere internet.
- La API Route no guarda las imágenes en el repositorio ni en almacenamiento permanente.
- Las respuestas llevan `Cache-Control: no-store`.
