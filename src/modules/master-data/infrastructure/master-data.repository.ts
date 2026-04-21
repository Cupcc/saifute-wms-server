import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataBootstrapRepository } from "./master-data-bootstrap.repository";
import { MasterDataMaterialsRepository } from "./master-data-materials.repository";
import { MasterDataPartyRepository } from "./master-data-party.repository";
import { MasterDataSuggestionsRepository } from "./master-data-suggestions.repository";
import { MasterDataWorkshopStockScopeRepository } from "./master-data-workshop-stock-scope.repository";

export {
  DEFAULT_MATERIAL_CATEGORY_CODE,
  DEFAULT_MATERIAL_CATEGORY_NAME,
} from "./master-data-bootstrap.repository";

@Injectable()
export class MasterDataRepository {
  private readonly bootstrapRepository: MasterDataBootstrapRepository;
  private readonly suggestionsRepository: MasterDataSuggestionsRepository;
  private readonly materialsRepository: MasterDataMaterialsRepository;
  private readonly partyRepository: MasterDataPartyRepository;
  private readonly workshopStockScopeRepository: MasterDataWorkshopStockScopeRepository;

  constructor(prisma: PrismaService) {
    this.bootstrapRepository = new MasterDataBootstrapRepository(prisma);
    this.suggestionsRepository = new MasterDataSuggestionsRepository(prisma);
    this.materialsRepository = new MasterDataMaterialsRepository(prisma);
    this.partyRepository = new MasterDataPartyRepository(prisma);
    this.workshopStockScopeRepository =
      new MasterDataWorkshopStockScopeRepository(prisma);
  }

  async ensureCanonicalWorkshops(
    ...args: Parameters<
      MasterDataBootstrapRepository["ensureCanonicalWorkshops"]
    >
  ) {
    return this.bootstrapRepository.ensureCanonicalWorkshops(...args);
  }

  async ensureCanonicalStockScopes(
    ...args: Parameters<
      MasterDataBootstrapRepository["ensureCanonicalStockScopes"]
    >
  ) {
    return this.bootstrapRepository.ensureCanonicalStockScopes(...args);
  }

  async ensureDefaultMaterialCategory(
    ...args: Parameters<
      MasterDataBootstrapRepository["ensureDefaultMaterialCategory"]
    >
  ) {
    return this.bootstrapRepository.ensureDefaultMaterialCategory(...args);
  }

  async assignDefaultCategoryToUncategorizedMaterials(
    ...args: Parameters<
      MasterDataBootstrapRepository["assignDefaultCategoryToUncategorizedMaterials"]
    >
  ) {
    return this.bootstrapRepository.assignDefaultCategoryToUncategorizedMaterials(
      ...args,
    );
  }

  async findMaterialSuggestionValues(
    ...args: Parameters<
      MasterDataSuggestionsRepository["findMaterialSuggestionValues"]
    >
  ) {
    return this.suggestionsRepository.findMaterialSuggestionValues(...args);
  }

  async findCustomerSuggestionValues(
    ...args: Parameters<
      MasterDataSuggestionsRepository["findCustomerSuggestionValues"]
    >
  ) {
    return this.suggestionsRepository.findCustomerSuggestionValues(...args);
  }

  async findSupplierSuggestionValues(
    ...args: Parameters<
      MasterDataSuggestionsRepository["findSupplierSuggestionValues"]
    >
  ) {
    return this.suggestionsRepository.findSupplierSuggestionValues(...args);
  }

  async findWorkshopSuggestionValues(
    ...args: Parameters<
      MasterDataSuggestionsRepository["findWorkshopSuggestionValues"]
    >
  ) {
    return this.suggestionsRepository.findWorkshopSuggestionValues(...args);
  }

  async findPersonnelSuggestionValues(
    ...args: Parameters<
      MasterDataSuggestionsRepository["findPersonnelSuggestionValues"]
    >
  ) {
    return this.suggestionsRepository.findPersonnelSuggestionValues(...args);
  }

  async findMaterialCategories(
    ...args: Parameters<MasterDataMaterialsRepository["findMaterialCategories"]>
  ) {
    return this.materialsRepository.findMaterialCategories(...args);
  }

  async findMaterialCategoryById(
    ...args: Parameters<
      MasterDataMaterialsRepository["findMaterialCategoryById"]
    >
  ) {
    return this.materialsRepository.findMaterialCategoryById(...args);
  }

  async findMaterialCategoryByCode(
    ...args: Parameters<
      MasterDataMaterialsRepository["findMaterialCategoryByCode"]
    >
  ) {
    return this.materialsRepository.findMaterialCategoryByCode(...args);
  }

  async createMaterialCategory(
    ...args: Parameters<MasterDataMaterialsRepository["createMaterialCategory"]>
  ) {
    return this.materialsRepository.createMaterialCategory(...args);
  }

  async updateMaterialCategory(
    ...args: Parameters<MasterDataMaterialsRepository["updateMaterialCategory"]>
  ) {
    return this.materialsRepository.updateMaterialCategory(...args);
  }

  async countActiveMaterialsByCategory(
    ...args: Parameters<
      MasterDataMaterialsRepository["countActiveMaterialsByCategory"]
    >
  ) {
    return this.materialsRepository.countActiveMaterialsByCategory(...args);
  }

  async findMaterials(
    ...args: Parameters<MasterDataMaterialsRepository["findMaterials"]>
  ) {
    return this.materialsRepository.findMaterials(...args);
  }

  async findMaterialById(
    ...args: Parameters<MasterDataMaterialsRepository["findMaterialById"]>
  ) {
    return this.materialsRepository.findMaterialById(...args);
  }

  async findMaterialByCode(
    ...args: Parameters<MasterDataMaterialsRepository["findMaterialByCode"]>
  ) {
    return this.materialsRepository.findMaterialByCode(...args);
  }

  async createMaterial(
    ...args: Parameters<MasterDataMaterialsRepository["createMaterial"]>
  ) {
    return this.materialsRepository.createMaterial(...args);
  }

  async createAutoMaterial(
    ...args: Parameters<MasterDataMaterialsRepository["createAutoMaterial"]>
  ) {
    return this.materialsRepository.createAutoMaterial(...args);
  }

  async updateMaterial(
    ...args: Parameters<MasterDataMaterialsRepository["updateMaterial"]>
  ) {
    return this.materialsRepository.updateMaterial(...args);
  }

  async countPositiveInventoryBalanceRows(
    ...args: Parameters<
      MasterDataMaterialsRepository["countPositiveInventoryBalanceRows"]
    >
  ) {
    return this.materialsRepository.countPositiveInventoryBalanceRows(...args);
  }

  async countEffectiveDocumentReferences(
    ...args: Parameters<
      MasterDataMaterialsRepository["countEffectiveDocumentReferences"]
    >
  ) {
    return this.materialsRepository.countEffectiveDocumentReferences(...args);
  }

  async findCustomers(
    ...args: Parameters<MasterDataPartyRepository["findCustomers"]>
  ) {
    return this.partyRepository.findCustomers(...args);
  }

  async findCustomerById(
    ...args: Parameters<MasterDataPartyRepository["findCustomerById"]>
  ) {
    return this.partyRepository.findCustomerById(...args);
  }

  async findCustomerByCode(
    ...args: Parameters<MasterDataPartyRepository["findCustomerByCode"]>
  ) {
    return this.partyRepository.findCustomerByCode(...args);
  }

  async createCustomer(
    ...args: Parameters<MasterDataPartyRepository["createCustomer"]>
  ) {
    return this.partyRepository.createCustomer(...args);
  }

  async createAutoCustomer(
    ...args: Parameters<MasterDataPartyRepository["createAutoCustomer"]>
  ) {
    return this.partyRepository.createAutoCustomer(...args);
  }

  async updateCustomer(
    ...args: Parameters<MasterDataPartyRepository["updateCustomer"]>
  ) {
    return this.partyRepository.updateCustomer(...args);
  }

  async countActiveChildCustomers(
    ...args: Parameters<MasterDataPartyRepository["countActiveChildCustomers"]>
  ) {
    return this.partyRepository.countActiveChildCustomers(...args);
  }

  async findSupplierById(
    ...args: Parameters<MasterDataPartyRepository["findSupplierById"]>
  ) {
    return this.partyRepository.findSupplierById(...args);
  }

  async findSupplierByCode(
    ...args: Parameters<MasterDataPartyRepository["findSupplierByCode"]>
  ) {
    return this.partyRepository.findSupplierByCode(...args);
  }

  async findSuppliers(
    ...args: Parameters<MasterDataPartyRepository["findSuppliers"]>
  ) {
    return this.partyRepository.findSuppliers(...args);
  }

  async createSupplier(
    ...args: Parameters<MasterDataPartyRepository["createSupplier"]>
  ) {
    return this.partyRepository.createSupplier(...args);
  }

  async createAutoSupplier(
    ...args: Parameters<MasterDataPartyRepository["createAutoSupplier"]>
  ) {
    return this.partyRepository.createAutoSupplier(...args);
  }

  async updateSupplier(
    ...args: Parameters<MasterDataPartyRepository["updateSupplier"]>
  ) {
    return this.partyRepository.updateSupplier(...args);
  }

  async findPersonnel(
    ...args: Parameters<MasterDataPartyRepository["findPersonnel"]>
  ) {
    return this.partyRepository.findPersonnel(...args);
  }

  async findPersonnelById(
    ...args: Parameters<MasterDataPartyRepository["findPersonnelById"]>
  ) {
    return this.partyRepository.findPersonnelById(...args);
  }

  async createPersonnel(
    ...args: Parameters<MasterDataPartyRepository["createPersonnel"]>
  ) {
    return this.partyRepository.createPersonnel(...args);
  }

  async updatePersonnel(
    ...args: Parameters<MasterDataPartyRepository["updatePersonnel"]>
  ) {
    return this.partyRepository.updatePersonnel(...args);
  }

  async findWorkshops(
    ...args: Parameters<MasterDataWorkshopStockScopeRepository["findWorkshops"]>
  ) {
    return this.workshopStockScopeRepository.findWorkshops(...args);
  }

  async findWorkshopById(
    ...args: Parameters<
      MasterDataWorkshopStockScopeRepository["findWorkshopById"]
    >
  ) {
    return this.workshopStockScopeRepository.findWorkshopById(...args);
  }

  async findWorkshopByName(
    ...args: Parameters<
      MasterDataWorkshopStockScopeRepository["findWorkshopByName"]
    >
  ) {
    return this.workshopStockScopeRepository.findWorkshopByName(...args);
  }

  async createWorkshop(
    ...args: Parameters<
      MasterDataWorkshopStockScopeRepository["createWorkshop"]
    >
  ) {
    return this.workshopStockScopeRepository.createWorkshop(...args);
  }

  async updateWorkshop(
    ...args: Parameters<
      MasterDataWorkshopStockScopeRepository["updateWorkshop"]
    >
  ) {
    return this.workshopStockScopeRepository.updateWorkshop(...args);
  }

  async findStockScopes(
    ...args: Parameters<
      MasterDataWorkshopStockScopeRepository["findStockScopes"]
    >
  ) {
    return this.workshopStockScopeRepository.findStockScopes(...args);
  }

  async findStockScopeById(
    ...args: Parameters<
      MasterDataWorkshopStockScopeRepository["findStockScopeById"]
    >
  ) {
    return this.workshopStockScopeRepository.findStockScopeById(...args);
  }

  async findStockScopeByCode(
    ...args: Parameters<
      MasterDataWorkshopStockScopeRepository["findStockScopeByCode"]
    >
  ) {
    return this.workshopStockScopeRepository.findStockScopeByCode(...args);
  }

  async createStockScope(
    ...args: Parameters<
      MasterDataWorkshopStockScopeRepository["createStockScope"]
    >
  ) {
    return this.workshopStockScopeRepository.createStockScope(...args);
  }

  async updateStockScope(
    ...args: Parameters<
      MasterDataWorkshopStockScopeRepository["updateStockScope"]
    >
  ) {
    return this.workshopStockScopeRepository.updateStockScope(...args);
  }

  async countPositiveStockScopeBalanceRows(
    ...args: Parameters<
      MasterDataWorkshopStockScopeRepository["countPositiveStockScopeBalanceRows"]
    >
  ) {
    return this.workshopStockScopeRepository.countPositiveStockScopeBalanceRows(
      ...args,
    );
  }
}
