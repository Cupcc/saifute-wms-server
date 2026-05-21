import {
  FINANCE_ACCOUNTANT_PERMISSION_PRESET,
  FINANCE_ACCOUNTANT_ROLE_KEY,
} from "../../../../prisma/system-management.seed";
import { RbacState } from "./rbac-state";
import { RbacUserRepository } from "./rbac-user.repository";

const MUTATING_PERMISSION_SUFFIXES = [
  ":add",
  ":create",
  ":edit",
  ":update",
  ":remove",
  ":delete",
  ":deactivate",
  ":void",
  ":approve",
  ":reject",
  ":reset",
  ":resetPwd",
  ":run",
  ":pause",
  ":forceLogout",
  ":status-action",
  ":return-action",
  ":draft",
];

describe("Finance accountant RBAC role", () => {
  it("derives only read-oriented business permissions", async () => {
    const state = new RbacState();
    const repository = new RbacUserRepository(state);
    const role = state.roles.find(
      (item) => item.roleKey === FINANCE_ACCOUNTANT_ROLE_KEY,
    );
    if (!role) {
      throw new Error("Expected finance accountant role seed fixture to exist");
    }

    const created = repository.createUser({
      userName: "finance-smoke",
      nickName: "财务会计冒烟账号",
      deptId: 300,
      roleIds: [role.roleId],
      status: "0",
    });

    const user = await repository.findUserById(created.userId);
    const mutatingPermissions = user?.permissions.filter((permission) =>
      MUTATING_PERMISSION_SUFFIXES.some((suffix) =>
        permission.endsWith(suffix),
      ),
    );

    expect(role.roleName).toBe("财务会计");
    expect(user?.roles).toContain(FINANCE_ACCOUNTANT_ROLE_KEY);
    expect(user?.permissions).toEqual(
      expect.arrayContaining([
        "dashboard:view",
        "reporting:monthly-reporting:view",
        "reporting:export",
        "approval:document:status",
        "master:material:list",
        "inbound:order:list",
        "workshop-material:pick-order:list",
        "inventory:balance:list",
        "sales:project:get",
        "rd:project:get",
      ]),
    );
    expect(user?.permissions).not.toEqual(
      expect.arrayContaining([
        "master:material:create",
        "inbound:order:update",
        "workshop-material:pick-order:void",
        "sales:project:update",
        "approval:document:approve",
        "system:user:resetPwd",
      ]),
    );
    expect(mutatingPermissions).toEqual([]);
    expect(user?.permissions.sort()).toEqual(
      [...FINANCE_ACCOUNTANT_PERMISSION_PRESET].sort(),
    );
  });
});
