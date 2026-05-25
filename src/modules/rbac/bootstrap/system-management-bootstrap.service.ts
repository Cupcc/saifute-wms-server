import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import {
  FINANCE_ACCOUNTANT_PERMISSION_PRESET,
  FINANCE_ACCOUNTANT_ROLE_KEY,
  RD_OPERATOR_ROLE_KEY,
} from "../../../../prisma/system-management.seed";
import { RbacRuntimeRepository } from "../infrastructure/rbac-runtime.repository";

@Injectable()
export class SystemManagementBootstrapService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(SystemManagementBootstrapService.name);

  constructor(private readonly rbacRepository: RbacRuntimeRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.rbacRepository.hasPersistenceAdapter()) {
      return;
    }

    const normalizedBaseCounts =
      await this.rbacRepository.getNormalizedBaseCounts();
    const hasAnyNormalizedData = Object.values(normalizedBaseCounts).some(
      (count) => count > 0,
    );

    if (hasAnyNormalizedData) {
      await this.rbacRepository.loadFromNormalizedTables();
      if (normalizedBaseCounts.users > 0) {
        const repairedMenuDisplayMetadata =
          await this.rbacRepository.repairSeedMenuDisplayMetadata();
        if (repairedMenuDisplayMetadata) {
          await this.rbacRepository.flushPersistence();
        }
        const repairedSeedRoles = await this.rbacRepository.ensureSeedRoles([
          RD_OPERATOR_ROLE_KEY,
          FINANCE_ACCOUNTANT_ROLE_KEY,
        ]);
        const repairedRdSeedDrift =
          await this.rbacRepository.ensureSeedPermissionMenus(
            [RD_OPERATOR_ROLE_KEY],
            ["reporting:monthly-reporting:view", "reporting:export"],
          );
        const repairedFinanceSeedDrift = repairedSeedRoles
          ? await this.rbacRepository.ensureSeedPermissionMenus(
              [FINANCE_ACCOUNTANT_ROLE_KEY],
              FINANCE_ACCOUNTANT_PERMISSION_PRESET,
            )
          : false;
        const syncedSeedRoles = await this.rbacRepository.syncSeedRoleMenus([
          RD_OPERATOR_ROLE_KEY,
        ]);
        if (
          repairedMenuDisplayMetadata ||
          repairedSeedRoles ||
          repairedRdSeedDrift ||
          repairedFinanceSeedDrift ||
          syncedSeedRoles
        ) {
          await this.rbacRepository.flushPersistence();
          this.logger.log(
            "Repaired seed menu metadata and permission drift for system management baseline",
          );
        }
      }
      if (normalizedBaseCounts.users === 0) {
        this.logger.warn(
          "Normalized system-management tables are partially populated without users; loading existing rows without reseeding",
        );
      }
      this.logger.log(
        `Loaded system management state from normalized tables (${normalizedBaseCounts.users} users)`,
      );
      return;
    }

    await this.rbacRepository.persistState();
    this.logger.log("Persisted initial seed to normalized tables");
  }
}
