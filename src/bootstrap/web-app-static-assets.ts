import { existsSync } from "node:fs";
import * as path from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { AppConfigService } from "../shared/config/app-config.service";

// 让后端单进程伏服 Vue/Vite 构建产物（web/dist）。
// SPA 用 history 路由，未知路径需回退到 index.html，但 /api 与上传文件前缀要放行。
export function registerWebAppStaticAssets(
  app: NestExpressApplication,
  appConfigService: AppConfigService,
): void {
  const webDistPath = appConfigService.webDistPath;
  const indexHtmlPath = path.join(webDistPath, "index.html");

  // ponytail: 没有前端构建产物就只跑 API，不报错。
  if (!existsSync(indexHtmlPath)) {
    return;
  }

  app.useStaticAssets(webDistPath, { index: false });

  const apiPrefix = `/${appConfigService.apiGlobalPrefix}`;
  const profilePrefix = appConfigService.profilePublicPrefix;
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.get(/.*/, (req, res, next) => {
    if (
      req.path === apiPrefix ||
      req.path.startsWith(`${apiPrefix}/`) ||
      req.path.startsWith(profilePrefix)
    ) {
      next();
      return;
    }
    res.sendFile(indexHtmlPath);
  });
}
