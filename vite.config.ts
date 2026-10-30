import { createRequire } from "node:module";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const nodeRequire = createRequire(import.meta.url);

/** Runs netlify/functions/*.js in `npm run dev`, so live data works without the Netlify CLI. */
function netlifyFunctions(mode: string): Plugin {
  return {
    name: "netlify-functions-dev",
    apply: "serve",
    configureServer(server) {
      Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
      server.middlewares.use("/.netlify/functions", async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const name = url.pathname.replace(/^\//, "");
        if (!/^[a-z0-9-]+$/i.test(name)) {
          res.statusCode = 404;
          return res.end();
        }
        try {
          const file = path.resolve(process.cwd(), "netlify/functions", `${name}.js`);
          for (const key of Object.keys(nodeRequire.cache)) {
            if (key.includes(`${path.sep}netlify${path.sep}`)) delete nodeRequire.cache[key];
          }
          const out = await nodeRequire(file).handler({
            queryStringParameters: Object.fromEntries(url.searchParams),
          });
          res.statusCode = out.statusCode;
          for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, String(v));
          res.end(out.body);
        } catch (e) {
          res.statusCode = /Cannot find module/.test(String(e)) ? 404 : 500;
          res.end(String(e));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), netlifyFunctions(mode)],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
}));
