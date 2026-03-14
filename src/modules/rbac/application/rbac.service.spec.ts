import { Test } from "@nestjs/testing";
import { InMemoryRbacRepository } from "../infrastructure/in-memory-rbac.repository";
import { RbacService } from "./rbac.service";

describe("RbacService", () => {
  let rbacService: RbacService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RbacService, InMemoryRbacRepository],
    }).compile();

    rbacService = moduleRef.get(RbacService);
  });

  it("should filter routes for non-admin user", async () => {
    const routes = await rbacService.getRoutesForUser(2);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.path).toBe("/dashboard");
  });
});
