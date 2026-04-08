import { IsInt, IsOptional, Min } from "class-validator";
import { CreateWorkshopMaterialOrderLineDto } from "./create-workshop-material-order-line.dto";

export class UpdateWorkshopMaterialOrderLineDto extends CreateWorkshopMaterialOrderLineDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  id?: number;
}
