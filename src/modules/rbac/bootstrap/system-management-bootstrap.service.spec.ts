import { FINANCE_ACCOUNTANT_ROLE_KEY } from "../../../../prisma/system-management.seed";
import { RbacRuntimeRepository } from "../infrastructure/rbac-runtime.repository";
import { SystemManagementBootstrapService } from "./system-management-bootstrap.service";

describe("SystemManagementBootstrapService", () => {
  it("does not resync finance role permissions when the role already exists", async () => {
    const runtimeRepository = {
      hasPersistenceAdapter: jest.fn().mockReturnValue(true),
      getNormalizedBaseCounts: jest.fn().mockResolvedValue({
        depts: 1,
        posts: 1,
        menus: 1,
        roles: 1,
        users: 1,
        dictTypes: 1,
        dictData: 1,
        configs: 1,
        notices: 1,
      }),
      loadFromNormalizedTables: jest.fn().mockResolvedValue(undefined),
      repairSeedMenuDisplayMetadata: jest.fn().mockResolvedValue(false),
      flushPersistence: jest.fn().mockResolvedValue(undefined),
      ensureSeedRoles: jest.fn().mockResolvedValue(false),
      ensureSeedPermissionMenus: jest.fn().mockResolvedValue(false),
      syncSeedRoleMenus: jest.fn().mockResolvedValue(false),
      persistState: jest.fn().mockResolvedValue(undefined),
    };
    const bootstrapService = new SystemManagementBootstrapService(
      runtimeRepository as unknown as RbacRuntimeRepository,
    );

    await bootstrapService.onApplicationBootstrap();

    expect(runtimeRepository.ensureSeedRoles).toHaveBeenCalledWith([
      FINANCE_ACCOUNTANT_ROLE_KEY,
    ]);
    expect(runtimeRepository.ensureSeedPermissionMenus).toHaveBeenCalledTimes(
      1,
    );
    expect(runtimeRepository.ensureSeedPermissionMenus).toHaveBeenCalledWith(
      ["rd-operator"],
      ["reporting:monthly-reporting:view", "reporting:export"],
    );
    expect(runtimeRepository.syncSeedRoleMenus).toHaveBeenCalledWith([
      "rd-operator",
    ]);
  });
});
