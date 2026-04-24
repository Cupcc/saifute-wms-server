import { Injectable } from "@nestjs/common";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { SalesSnapshotsService } from "./sales-snapshots.service";

@Injectable()
export class SalesSharedService {
  constructor(
    public readonly masterDataService: MasterDataService,
    public readonly inventoryService: InventoryService,
    public readonly approvalService: ApprovalService,
    public readonly snapshots: SalesSnapshotsService,
  ) {}
}
