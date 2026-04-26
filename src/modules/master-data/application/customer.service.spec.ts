import { BadRequestException, ConflictException } from "@nestjs/common";
import { MasterDataRepository } from "../infrastructure/master-data.repository";
import { CustomerService } from "./customer.service";
import { createRepositoryMock } from "./master-data.service.test-support";

describe("CustomerService", () => {
  function createService() {
    const repository = createRepositoryMock();
    const service = new CustomerService(
      repository as unknown as MasterDataRepository,
    );
    return { repository, service };
  }

  it("lists customers with active-only filter by default", async () => {
    const { repository, service } = createService();
    repository.findCustomers.mockResolvedValue({ items: [], total: 0 });

    await service.list({ keyword: "集团", limit: 20, offset: 0 });

    expect(repository.findCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ACTIVE" }),
    );
  });

  it("creates a customer after unique-code check", async () => {
    const { repository, service } = createService();
    repository.findCustomerByCode.mockResolvedValue(null);
    repository.createCustomer.mockResolvedValue({
      id: 1,
      customerCode: "CUS-001",
      customerName: "测试客户",
      status: "ACTIVE",
    });

    const result = await service.create(
      {
        customerCode: "CUS-001",
        customerName: "测试客户",
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
      },
      "1",
    );

    expect(repository.createCustomer).toHaveBeenCalledWith(
      {
        customerCode: "CUS-001",
        customerName: "测试客户",
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
        parentId: undefined,
      },
      "1",
    );
    expect(result).toEqual(
      expect.objectContaining({ customerCode: "CUS-001" }),
    );
  });

  it("rejects duplicate customer codes on create", async () => {
    const { repository, service } = createService();
    repository.findCustomerByCode.mockResolvedValue({
      id: 1,
      customerCode: "CUS-001",
    });

    await expect(
      service.create({
        customerCode: "CUS-001",
        customerName: "重复",
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("blocks customer deactivation when active child customers exist", async () => {
    const { repository, service } = createService();
    repository.findCustomerById.mockResolvedValue({
      id: 1,
      customerCode: "CUS-001",
      status: "ACTIVE",
    });
    repository.countActiveChildCustomers.mockResolvedValue(3);

    await expect(service.deactivate(1, "1")).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.updateCustomer).not.toHaveBeenCalled();
  });

  it("deactivates customer when no active children", async () => {
    const { repository, service } = createService();
    repository.findCustomerById.mockResolvedValue({
      id: 1,
      customerCode: "CUS-001",
      status: "ACTIVE",
    });
    repository.countActiveChildCustomers.mockResolvedValue(0);
    repository.updateCustomer.mockResolvedValue({
      id: 1,
      status: "DISABLED",
    });

    const result = await service.deactivate(1, "1");

    expect(repository.updateCustomer).toHaveBeenCalledWith(
      1,
      { status: "DISABLED" },
      "1",
    );
    expect(result).toEqual(expect.objectContaining({ status: "DISABLED" }));
  });

  it("creates AUTO_CREATED customers only when provenance is complete", async () => {
    const { repository, service } = createService();
    repository.findCustomerByCode.mockResolvedValue(null);
    repository.createAutoCustomer.mockResolvedValue({
      id: 5,
      customerCode: "CUS-AUTO",
      status: "ACTIVE",
      creationMode: "AUTO_CREATED",
      sourceDocumentType: "SalesStockOrder",
      sourceDocumentId: 10,
    });

    const result = await service.ensure(
      {
        customerCode: "CUS-AUTO",
        customerName: "自动补建客户",
        sourceDocumentType: "SalesStockOrder",
        sourceDocumentId: 10,
      },
      "1",
    );

    expect(result).toEqual(
      expect.objectContaining({ creationMode: "AUTO_CREATED" }),
    );
  });

  // ─── tree parent validation ──────────────────────────────────────────────────

  it("rejects self-parent on update", async () => {
    const { repository, service } = createService();
    repository.findCustomerById.mockResolvedValue({
      id: 7,
      customerCode: "CUS-001",
      status: "ACTIVE",
      parentId: null,
    });

    await expect(service.update(7, { parentId: 7 }, "1")).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.updateCustomer).not.toHaveBeenCalled();
  });

  it("rejects cycle on update", async () => {
    const { repository, service } = createService();
    repository.findCustomerById
      .mockResolvedValueOnce({
        id: 7,
        customerCode: "CUS-001",
        status: "ACTIVE",
        parentId: null,
      })
      .mockResolvedValueOnce({
        id: 20,
        customerCode: "CUS-CHILD",
        parentId: 7,
      });

    await expect(service.update(7, { parentId: 20 }, "1")).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.updateCustomer).not.toHaveBeenCalled();
  });

  it("accepts a valid non-cycle parent on update", async () => {
    const { repository, service } = createService();
    repository.findCustomerById
      .mockResolvedValueOnce({
        id: 7,
        customerCode: "CUS-001",
        status: "ACTIVE",
        parentId: null,
      })
      .mockResolvedValueOnce({
        id: 2,
        customerCode: "CUS-GROUP",
        parentId: null,
      });
    repository.updateCustomer.mockResolvedValue({ id: 7, parentId: 2 });

    await expect(
      service.update(7, { parentId: 2 }, "1"),
    ).resolves.toBeDefined();
    expect(repository.updateCustomer).toHaveBeenCalled();
  });

  it("updates customer contact fields and allows clearing them", async () => {
    const { repository, service } = createService();
    repository.findCustomerById.mockResolvedValue({
      id: 7,
      customerCode: "CUS-001",
      status: "ACTIVE",
      parentId: null,
    });
    repository.updateCustomer.mockResolvedValue({
      id: 7,
      customerName: "新客户",
      contactPerson: null,
      contactPhone: "13800000000",
      address: null,
    });

    await service.update(
      7,
      {
        customerName: "新客户",
        contactPerson: "",
        contactPhone: "13800000000",
        address: null,
      },
      "1",
    );

    expect(repository.updateCustomer).toHaveBeenCalledWith(
      7,
      {
        customerName: "新客户",
        parentId: undefined,
        contactPerson: null,
        contactPhone: "13800000000",
        address: null,
      },
      "1",
    );
  });
});
