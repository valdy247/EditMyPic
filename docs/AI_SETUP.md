# EditMyPic — configuración de Borrar con IA

## Lo que funciona sin servidor

`Fondo > Quitar fondo` usa Apple Vision dentro del iPhone. También funcionan localmente:

- fondo transparente;
- color sólido;
- degradados;
- otra fotografía;
- fondo desenfocado;
- suavizado de bordes;
- sombra del sujeto.

Estas herramientas necesitan una build nativa nueva, pero no necesitan una clave de IA.

## Lo que necesita servidor

`Borrar` envía únicamente una copia temporal de la composición y la máscara pintada al endpoint `api/v1/erase.js`.

Variables de Vercel:

- `OPENAI_API_KEY`: secreta y disponible solo para el servidor.
- `EDIT_API_ACCESS_TOKEN`: opcional; no se usa en la primera versión móvil.

Variable pública de Expo Launch:

- `EXPO_PUBLIC_EDIT_API_URL`: dominio raíz del proyecto Vercel, sin `/api/v1/erase`.

Ejemplo:

```text
https://edit-my-pic.vercel.app
```

La clave de OpenAI nunca debe añadirse a `app.json`, `.env.example`, GitHub ni Expo como variable pública.

## Flujo de publicación

1. Desplegar el repositorio en Vercel.
2. Añadir `OPENAI_API_KEY` en Project Settings > Environment Variables.
3. Copiar el dominio de producción del proyecto.
4. Añadir ese dominio como `EXPO_PUBLIC_EDIT_API_URL` en Expo Launch.
5. Crear una build iOS nueva para incluir el módulo Apple Vision.
