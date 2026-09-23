// Dispara el workflow "Actualizar la despensa" del repo ZoTaD/VikingsProyect.
// Necesita el secreto GH_TOKEN: un token de GitHub con permiso "Actions: read and write"
// solo sobre ese repositorio. Se carga con `npx wrangler secret put GH_TOKEN`.
const URL = "https://api.github.com/repos/ZoTaD/VikingsProyect/actions/workflows/actualizar.yml/dispatches";

async function disparar(env) {
  if (!env.GH_TOKEN) throw new Error("Falta el secreto GH_TOKEN");
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "vikings-despensa-disparador",
    },
    body: JSON.stringify({ ref: "main", inputs: { origen: "automatico" } }),
  });
  if (res.status !== 204) {
    throw new Error(`GitHub respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

export default {
  async scheduled(controller, env, ctx) {
    // hasta 3 intentos por si GitHub responde mal un momento
    for (let i = 1; i <= 3; i++) {
      try {
        await disparar(env);
        console.log(`Workflow disparado (${controller.cron})`);
        return;
      } catch (e) {
        console.error(`Intento ${i}: ${e.message}`);
        if (i < 3) await new Promise(r => setTimeout(r, 5000 * i));
      }
    }
    throw new Error("No se pudo disparar el workflow");
  },
};
