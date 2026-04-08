import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { Permissions } from "../../../shared/decorators/permissions.decorator";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { MasterDataService } from "../application/master-data.service";
import { CreateCustomerDto } from "../dto/create-customer.dto";
import { CreateMaterialDto } from "../dto/create-material.dto";
import { CreateMaterialCategoryDto } from "../dto/create-material-category.dto";
import { CreatePersonnelDto } from "../dto/create-personnel.dto";
import { CreateStockScopeDto } from "../dto/create-stock-scope.dto";
import { CreateSupplierDto } from "../dto/create-supplier.dto";
import { CreateWorkshopDto } from "../dto/create-workshop.dto";
import { QueryMasterDataDto } from "../dto/query-master-data.dto";
import { UpdateCustomerDto } from "../dto/update-customer.dto";
import { UpdateMaterialDto } from "../dto/update-material.dto";
import { UpdateMaterialCategoryDto } from "../dto/update-material-category.dto";
import { UpdatePersonnelDto } from "../dto/update-personnel.dto";
import { UpdateStockScopeDto } from "../dto/update-stock-scope.dto";
import { UpdateSupplierDto } from "../dto/update-supplier.dto";
import { UpdateWorkshopDto } from "../dto/update-workshop.dto";

@Controller("master-data")
export class MasterDataController {
  constructor(private readonly masterDataService: MasterDataService) {}

  // ─── Field Suggestions ──────────────────────────────────────────────────────

  @Get("field-suggestions")
  async getFieldSuggestions(
    @Query("scope") scope: string,
    @Query("field") field: string,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const requiredPermission =
      this.masterDataService.getFieldSuggestionsRequiredPermission(scope);
    this.assertFieldSuggestionPermission(user, requiredPermission);
    return this.masterDataService.getFieldSuggestions(scope, field);
  }

  private assertFieldSuggestionPermission(
    user: SessionUserSnapshot | undefined,
    requiredPermission: string,
  ) {
    if (!user) {
      throw new UnauthorizedException("当前请求未携带用户上下文");
    }
    if (user.userId === 1) {
      return;
    }
    if (!user.permissions.includes(requiredPermission)) {
      throw new ForbiddenException("当前用户缺少所需权限");
    }
  }

  // ─── MaterialCategory (F1) ──────────────────────────────────────────────────

  @Permissions("master:material-category:list")
  @Get("material-categories")
  async listMaterialCategories(@Query() query: QueryMasterDataDto) {
    return this.masterDataService.listMaterialCategories(query);
  }

  @Permissions("master:material-category:list")
  @Get("material-categories/:id")
  async getMaterialCategory(@Param("id", ParseIntPipe) id: number) {
    return this.masterDataService.getMaterialCategoryById(id);
  }

  @Permissions("master:material-category:create")
  @Post("material-categories")
  async createMaterialCategory(
    @Body() dto: CreateMaterialCategoryDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.createMaterialCategory(
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("master:material-category:update")
  @Patch("material-categories/:id")
  async updateMaterialCategory(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateMaterialCategoryDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.updateMaterialCategory(
      id,
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("master:material-category:deactivate")
  @Patch("material-categories/:id/deactivate")
  async deactivateMaterialCategory(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.deactivateMaterialCategory(
      id,
      user?.userId?.toString(),
    );
  }

  // ─── Material (F2) ──────────────────────────────────────────────────────────

  @Permissions("master:material:list")
  @Get("materials")
  async listMaterials(@Query() query: QueryMasterDataDto) {
    return this.masterDataService.listMaterials(query);
  }

  @Permissions("master:material:list")
  @Get("materials/:id")
  async getMaterial(@Param("id", ParseIntPipe) id: number) {
    return this.masterDataService.getMaterialById(id);
  }

  @Permissions("master:material:create")
  @Post("materials")
  async createMaterial(
    @Body() dto: CreateMaterialDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.createMaterial(dto, user?.userId?.toString());
  }

  @Permissions("master:material:update")
  @Patch("materials/:id")
  async updateMaterial(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateMaterialDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.updateMaterial(
      id,
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("master:material:deactivate")
  @Patch("materials/:id/deactivate")
  async deactivateMaterial(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.deactivateMaterial(
      id,
      user?.userId?.toString(),
    );
  }

  // ─── Customer (F3) ──────────────────────────────────────────────────────────

  @Permissions("master:customer:list")
  @Get("customers")
  async listCustomers(@Query() query: QueryMasterDataDto) {
    return this.masterDataService.listCustomers(query);
  }

  @Permissions("master:customer:list")
  @Get("customers/:id")
  async getCustomer(@Param("id", ParseIntPipe) id: number) {
    return this.masterDataService.getCustomerById(id);
  }

  @Permissions("master:customer:create")
  @Post("customers")
  async createCustomer(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.createCustomer(dto, user?.userId?.toString());
  }

  @Permissions("master:customer:update")
  @Patch("customers/:id")
  async updateCustomer(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.updateCustomer(
      id,
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("master:customer:deactivate")
  @Patch("customers/:id/deactivate")
  async deactivateCustomer(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.deactivateCustomer(
      id,
      user?.userId?.toString(),
    );
  }

  // ─── Supplier (F4) ──────────────────────────────────────────────────────────

  @Permissions("master:supplier:list")
  @Get("suppliers")
  async listSuppliers(@Query() query: QueryMasterDataDto) {
    return this.masterDataService.listSuppliers(query);
  }

  @Permissions("master:supplier:list")
  @Get("suppliers/:id")
  async getSupplier(@Param("id", ParseIntPipe) id: number) {
    return this.masterDataService.getSupplierById(id);
  }

  @Permissions("master:supplier:create")
  @Post("suppliers")
  async createSupplier(
    @Body() dto: CreateSupplierDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.createSupplier(dto, user?.userId?.toString());
  }

  @Permissions("master:supplier:update")
  @Patch("suppliers/:id")
  async updateSupplier(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.updateSupplier(
      id,
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("master:supplier:deactivate")
  @Patch("suppliers/:id/deactivate")
  async deactivateSupplier(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.deactivateSupplier(
      id,
      user?.userId?.toString(),
    );
  }

  // ─── Personnel (F5) ─────────────────────────────────────────────────────────

  @Permissions("master:personnel:list")
  @Get("personnel")
  async listPersonnel(@Query() query: QueryMasterDataDto) {
    return this.masterDataService.listPersonnel(query);
  }

  @Permissions("master:personnel:list")
  @Get("personnel/:id")
  async getPersonnel(@Param("id", ParseIntPipe) id: number) {
    return this.masterDataService.getPersonnelById(id);
  }

  @Permissions("master:personnel:create")
  @Post("personnel")
  async createPersonnel(
    @Body() dto: CreatePersonnelDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.createPersonnel(
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("master:personnel:update")
  @Patch("personnel/:id")
  async updatePersonnel(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdatePersonnelDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.updatePersonnel(
      id,
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("master:personnel:deactivate")
  @Patch("personnel/:id/deactivate")
  async deactivatePersonnel(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.deactivatePersonnel(
      id,
      user?.userId?.toString(),
    );
  }

  // ─── Workshop (F6) ──────────────────────────────────────────────────────────

  @Permissions("master:workshop:list")
  @Get("workshops")
  async listWorkshops(@Query() query: QueryMasterDataDto) {
    return this.masterDataService.listWorkshops(query);
  }

  @Permissions("master:workshop:list")
  @Get("workshops/:id")
  async getWorkshop(@Param("id", ParseIntPipe) id: number) {
    return this.masterDataService.getWorkshopById(id);
  }

  @Permissions("master:workshop:create")
  @Post("workshops")
  async createWorkshop(
    @Body() dto: CreateWorkshopDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.createWorkshop(dto, user?.userId?.toString());
  }

  @Permissions("master:workshop:update")
  @Patch("workshops/:id")
  async updateWorkshop(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateWorkshopDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.updateWorkshop(
      id,
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("master:workshop:deactivate")
  @Patch("workshops/:id/deactivate")
  async deactivateWorkshop(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.deactivateWorkshop(
      id,
      user?.userId?.toString(),
    );
  }

  // ─── StockScope (F7) ────────────────────────────────────────────────────────

  @Permissions("master:stock-scope:list")
  @Get("stock-scopes")
  async listStockScopes(@Query() query: QueryMasterDataDto) {
    return this.masterDataService.listStockScopes(query);
  }

  @Permissions("master:stock-scope:list")
  @Get("stock-scopes/:id")
  async getStockScope(@Param("id", ParseIntPipe) id: number) {
    return this.masterDataService.getStockScopeById(id);
  }

  @Permissions("master:stock-scope:create")
  @Post("stock-scopes")
  async createStockScope(
    @Body() dto: CreateStockScopeDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.createStockScope(
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("master:stock-scope:update")
  @Patch("stock-scopes/:id")
  async updateStockScope(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateStockScopeDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.updateStockScope(
      id,
      dto,
      user?.userId?.toString(),
    );
  }

  @Permissions("master:stock-scope:deactivate")
  @Patch("stock-scopes/:id/deactivate")
  async deactivateStockScope(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.masterDataService.deactivateStockScope(
      id,
      user?.userId?.toString(),
    );
  }
}
