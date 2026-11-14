// =============================================================
//  CONFIGURACIÓN DE SUPABASE
//  Pega aquí los datos de tu proyecto de Supabase:
//  Supabase → tu proyecto → Project Settings → API
//    - "https://mjdihogtwwqsjjiyctyl.supabase.co"           → SUPABASE_URL
//    - "sb_publishable_TXkcd5UEmO3Z41KCX5pr7A_qhNcIdAR" (API key) → SUPABASE_ANON_KEY
//  La clave "anon" es pública por diseño: se puede subir a GitHub.
//  ¡NUNCA pongas aquí la clave "service_role"!
// =============================================================
window.SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
window.SUPABASE_ANON_KEY = "PEGA-AQUI-TU-ANON-KEY";

// Ajustes del juego (puedes cambiarlos)
window.GAME_SETTINGS = {
  segundosPregunta: 60,  // tiempo para colocar el dinero
  segundosTema: 15       // tiempo para elegir tema
};
