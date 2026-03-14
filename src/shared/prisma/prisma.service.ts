import { Injectable } from "@nestjs/common";

@Injectable()
export class PrismaService {
  async runInTransaction<T>(handler: () => Promise<T>): Promise<T> {
    return handler();
  }
}
