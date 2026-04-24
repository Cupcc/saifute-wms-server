import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { RdProjectRepository } from "./rd-project.repository";

@Injectable()
export class RdProjectPersistenceService extends RdProjectRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }
}
