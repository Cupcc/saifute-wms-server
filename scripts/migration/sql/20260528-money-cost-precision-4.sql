ALTER TABLE `inventory_monthly_snapshot`
  MODIFY COLUMN `total_in_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `total_out_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `inventory_log`
  MODIFY COLUMN `unit_cost` DECIMAL(18, 4) NULL,
  MODIFY COLUMN `cost_amount` DECIMAL(18, 4) NULL;

ALTER TABLE `stock_in_order`
  MODIFY COLUMN `total_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `stock_in_order_line`
  MODIFY COLUMN `unit_price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `stock_in_price_correction_order`
  MODIFY COLUMN `total_historical_diff_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `stock_in_price_correction_order_line`
  MODIFY COLUMN `wrong_unit_cost` DECIMAL(18, 4) NOT NULL,
  MODIFY COLUMN `correct_unit_cost` DECIMAL(18, 4) NOT NULL,
  MODIFY COLUMN `historical_diff_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `sales_stock_order`
  MODIFY COLUMN `total_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `sales_stock_order_line`
  MODIFY COLUMN `unit_price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `selected_unit_cost` DECIMAL(18, 4) NOT NULL,
  MODIFY COLUMN `cost_unit_price` DECIMAL(18, 4) NULL,
  MODIFY COLUMN `cost_amount` DECIMAL(18, 4) NULL;

ALTER TABLE `sales_project`
  MODIFY COLUMN `total_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `sales_project_material_line`
  MODIFY COLUMN `unit_price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `workshop_material_order`
  MODIFY COLUMN `total_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `workshop_material_order_line`
  MODIFY COLUMN `unit_price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `cost_unit_price` DECIMAL(18, 4) NULL,
  MODIFY COLUMN `cost_amount` DECIMAL(18, 4) NULL;

ALTER TABLE `rd_project`
  MODIFY COLUMN `total_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `rd_project_material_line`
  MODIFY COLUMN `unit_price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `cost_unit_price` DECIMAL(18, 4) NULL,
  MODIFY COLUMN `cost_amount` DECIMAL(18, 4) NULL;

ALTER TABLE `rd_project_bom_line`
  MODIFY COLUMN `unit_price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `rd_project_material_action`
  MODIFY COLUMN `total_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `rd_project_material_action_line`
  MODIFY COLUMN `unit_price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `cost_unit_price` DECIMAL(18, 4) NULL,
  MODIFY COLUMN `cost_amount` DECIMAL(18, 4) NULL;

ALTER TABLE `rd_handoff_order`
  MODIFY COLUMN `total_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `rd_handoff_order_line`
  MODIFY COLUMN `unit_price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `cost_unit_price` DECIMAL(18, 4) NULL,
  MODIFY COLUMN `cost_amount` DECIMAL(18, 4) NULL;

ALTER TABLE `rd_procurement_request`
  MODIFY COLUMN `total_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `rd_procurement_request_line`
  MODIFY COLUMN `unit_price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0;
