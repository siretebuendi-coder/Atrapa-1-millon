# 💰 El Millón: juego de trampillas

Juego para jugar en grupo, inspirado en *Atrapa un millón*. Hay una **pantalla principal** (la tele o un portátil) que muestra el **QR**. Cada pareja lo escanea con su móvil y arrastra con el dedo sus fajos de **50.000 €**. En la tele se ve en directo cómo se mueve el dinero y cómo caen las trampillas.

- Cada pareja empieza con 1.000.000 € (20 fajos de 50.000 €).
- Hay 8 preguntas: las 4 primeras tienen 4 respuestas, de la 5 a la 7 tienen 3, y la 8ª tiene 2 (todo o nada).
- Antes de cada pregunta la pareja elige entre dos temas. Hay 60 segundos para colocar el dinero, y siempre hay que dejar al menos una trampilla vacía.
- Pueden jugar de 1 a 3 parejas, por turnos.

No hace falta programar ni instalar nada: es una web estática. Supabase solo se usa para conectar los móviles con la tele en tiempo real, así que **no hay que crear tablas**.

---

## Paso 1: Supabase (5 minutos)

1. Entra en <https://supabase.com>, crea una cuenta y pulsa **New project**. Ponle nombre, contraseña y región (por ejemplo, *West EU*).
2. Cuando esté creado, ve a **Project Settings → API** (o **Data API / API Keys**) y copia:
   - **Project URL**: algo como `https://abcdxyz.supabase.co`
   - La clave **anon public**: un texto muy largo que empieza por `eyJ...` (o `sb_publishable_...`)
3. Comprueba que *Realtime* permite canales públicos: ve a **Realtime → Settings** y deja **desactivada** la opción *"Private channels only"* (si aparece). Viene así por defecto.

## Paso 2: Poner las claves en el juego

Abre el archivo `js/config.js` y cambia estas dos líneas:

```js
window.SUPABASE_URL = "https://abcdxyz.supabase.co";
window.SUPABASE_ANON_KEY = "eyJ...tu clave anon...";
```

> La clave **anon** es pública por diseño, así que se puede subir a GitHub sin problema. **Nunca** pongas la clave `service_role`.

(También puedes subir el proyecto primero y editar `js/config.js` después, desde la web de GitHub: abre el archivo, pulsa el lápiz ✏️ y luego *Commit changes*.)

## Paso 3: Subirlo a GitHub

1. Entra en <https://github.com> → **New repository** → ponle el nombre `el-millon` → **Create repository**.
2. Pulsa **uploading an existing file** y arrastra **todo el contenido** de esta carpeta: `index.html`, `vercel.json`, `README.md` y las carpetas `css` y `js`.
3. Pulsa **Commit changes**.

## Paso 4: Publicarlo en Vercel

1. Entra en <https://vercel.com> e inicia sesión con tu cuenta de GitHub.
2. Pulsa **Add New… → Project**, elige el repositorio `el-millon` y pulsa **Import**.
3. En *Framework Preset* deja **Other** (no hay que tocar nada más) y pulsa **Deploy**.
4. Te dará una dirección del tipo `https://el-millon.vercel.app`. ¡Esa es tu web!

Cada vez que cambies algo en GitHub, Vercel lo vuelve a publicar solo.

---

## Cómo se juega

1. En la **tele o el portátil**, abre la web y pulsa **📺 Pantalla principal**. Aparecerá un **QR** y un código de 4 letras.
2. Cada pareja **escanea el QR** con la cámara del móvil, escribe su nombre y pulsa **Entrar**.
3. Cuando estén todas (máximo 3), pulsa **Empezar partida** en la tele.
4. Cuando le toca, la pareja elige tema en su móvil y **arrastra los fajos** desde «Sin colocar» hasta las respuestas. Los botones *1 / 2 / 5 / Todos* sirven para mover varios fajos de golpe. Después pulsa **Confirmar**.
5. En la tele se abren las trampillas incorrectas, el dinero cae, y pasa el turno a la siguiente pareja.

¿Sin móviles? En la portada está **«jugad todos en un solo dispositivo»**: cada pareja arrastra los fajos en la misma pantalla cuando le toca.

## Personalizar

- **Preguntas:** `js/questions.js`. Cada línea es así:
  `Q("Tema","¿Pregunta?",["Respuesta CORRECTA","Incorrecta 1","Incorrecta 2","Incorrecta 3"]);`
  La **primera** respuesta siempre es la buena (el juego las baraja). Pon 4 respuestas para las preguntas 1-4, 3 para las 5-7 y 2 para la final. Añade `,true` al final si la pregunta salió en el programa (sale marcada con ★).
- **Tiempos:** `js/config.js` (`segundosPregunta`, `segundosTema`).

## Archivos

```
index.html        página principal
css/styles.css    diseño
js/config.js      claves de Supabase y ajustes  ← lo único que tienes que editar
js/questions.js   banco de preguntas
js/app.js         lógica del juego (tele, móviles, QR, tiempo real)
vercel.json       configuración de Vercel
```
