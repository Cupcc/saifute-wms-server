import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { InMemoryRbacRepository } from "../infrastructure/in-memory-rbac.repository";

@Injectable()
export class SystemManagementBootstrapService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(SystemManagementBootstrapService.name);

  constructor(private readonly rbacRepository: InMemoryRbacRepository) {}

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
