import { BadRequestException } from "@nestjs/common";
import { DocumentLifecycleStatus } from "../../../../generated/prisma/client";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProjectLookupService } from "../../rd-project/application/rd-project-lookup.service";
import { RdProcurementRequestRepository } from "../infrastructure/rd-procurement-request.repository";

export async function resolveHandoffHandlerSnapshot(
  masterDataService: MasterDataService,
  handlerPersonnelId: number,
) {
  const personnel =
    await masterDataService.getPersonnelById(handlerPersonnelId);
  return { handlerNameSnapshot: personnel.personnelName };
}

export async function resolveHandoffSourceRequest(
  repository: RdProcurementRequestRepository,
  requestId: number | undefined,
  cache: Map<
    number,
    Awaited<ReturnType<RdProcurementRequestRepository["findRequestById"]>>
  >,
): Promise<
  NonNullable<
    Awaited<ReturnType<RdProcurementRequestRepository["findRequestById"]>>
  >
> {
  if (!requestId) {
    throw new BadRequestException("RD 交接明细必须绑定采购需求单");
  }
  if (cache.has(requestId)) {
    const cached = cache.get(requestId);
    if (cached) {
      return cached;
    }
  }

  const request = await repository.findRequestById(requestId);
  if (!request) {
    throw new BadRequestException(`采购需求不存在: ${requestId}`);
  }
  if (request.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE) {
    throw new BadRequestException("只能关联有效的 RD 采购需求");
  }
  cache.set(requestId, request);
  return request;
}

export async function resolveHandoffRdProjectForRequest(
  rdProjectLookupService: RdProjectLookupService,
  request: NonNullable<
    Awaited<ReturnType<RdProcurementRequestRepository["findRequestById"]>>
  >,
  cache: Map<
    string,
    Awaited<ReturnType<RdProjectLookupService["requireEffectiveProjectByCode"]>>
  >,
) {
  const projectCode = request.projectCode?.trim();
  if (!projectCode) {
    throw new BadRequestException("RD 采购需求缺少研发项目编码，无法创建交接");
  }

  if (cache.has(projectCode)) {
    const cached = cache.get(projectCode);
    if (cached) {
      return cached;
    }
  }

  const project =
    await rdProjectLookupService.requireEffectiveProjectByCode(projectCode);
  if (project.workshopId !== request.workshopId) {
    throw new BadRequestException(
      `采购需求与研发项目业务车间不一致: ${projectCode}`,
    );
  }
  if (
    request.projectName &&
    project.projectName &&
    request.projectName.trim() !== project.projectName.trim()
  ) {
    throw new BadRequestException(
      `采购需求项目名称与研发项目不一致: ${projectCode}`,
    );
  }

  cache.set(projectCode, project);
  return project;
}
