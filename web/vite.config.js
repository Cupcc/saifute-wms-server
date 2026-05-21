import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import createVitePlugins from "./vite/plugins";

const allowedDevServerHosts = ["company.sdsft.cc"];

function readBackendPortFromRootEnv() {
  const rootDir = path.resolve(__dirname, "..");
  const envCandidates = [".env.dev", ".env"];

  for (const envFile of envCandidates) {
    const envPath = path.join(rootDir, envFile);
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/^\s*PORT\s*=\s*"?([^"\r\n]+)"?\s*$/m);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "3000";
}

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd());
  const { VITE_APP_ENV, VITE_PROXY_TARGET } = env;
  const defaultBackendPort = readBackendPortFromRootEnv();
  const baseUrl = VITE_PROXY_TARGET || `http://127.0.0.1:${defaultBackendPort}`; // 后端接口
  // const baseUrl = mode === 'production' ? 'http://120.26.116.249:8080' : 'http://192.168.6.20:8080' // 后端接口
  if (mode === "development") {
    console.log(baseUrl, "baseUrl");
  }
  return {
    // 部署生产环境和开发环境下的URL。
    // 默认情况下，vite 会假设你的应用是被部署在一个域名的根路径上
    // 例如 https://www.**.com/。如果应用被部署在一个子路径上，你就需要用这个选项指定这个子路径。例如，如果你的应用被部署在 https://www.**.com/admin/，则设置 baseUrl 为 /admin/。
    base: VITE_APP_ENV === "production" ? "/" : "/",
    plugins: [...createVitePlugins(env, command === "build")],
    resolve: {
      // https://cn.vitejs.dev/config/#resolve-alias
      alias: {
        // 设置路径
        "~": path.resolve(__dirname, "./"),
        // 设置别名
        "@": path.resolve(__dirname, "./src"),
      },
      // https://cn.vitejs.dev/config/#resolve-extensions
      extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json", ".vue"],
    },
    optimizeDeps: {
      // Work around a dev-time bootstrap crash where Vite's pre-bundled
      // `@element-plus/icons-vue` chunk throws `isFunction is not a function`
      // before the Vue runtime finishes initializing.
      exclude: ["@element-plus/icons-vue"],
    },
    // 打包配置
    build: {
      // https://vite.dev/config/build-options.html
      sourcemap: command === "build" ? false : "inline",
      outDir: "dist",
      assetsDir: "assets",
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          chunkFileNames: "static/js/[name]-[hash].js",
          entryFileNames: "static/js/[name]-[hash].js",
          assetFileNames: "static/[ext]/[name]-[hash].[ext]",
        },
      },
    },
    // vite 相关配置
    server: {
      port: 90,
      host: true,
      allowedHosts: allowedDevServerHosts,
      open: false,
      proxy: {
        // https://cn.vitejs.dev/config/#server-proxy
        "/dev-api": {
          target: baseUrl,
          changeOrigin: true,
          xfwd: true,
          rewrite: (p) => p.replace(/^\/dev-api/, ""),
        },
        // springdoc proxy
        "^/v3/api-docs/(.*)": {
          target: baseUrl,
          changeOrigin: true,
          xfwd: true,
        },
      },
    },
    css: {
      postcss: {
        plugins: [
          {
            postcssPlugin: "internal:charset-removal",
            AtRule: {
              charset: (atRule) => {
                if (atRule.name === "charset") {
                  atRule.remove();
                }
              },
            },
          },
        ],
      },
    },
  };
});
