-- RD procurement free-text item support and immutable material-binding audit.
-- Run once on MariaDB/MySQL while RD procurement writes are paused.

-- Preflight evidence: retain this result with the deployment record.
SELECT
  COUNT(*) AS procurement_line_count,
  COALESCE(SUM(`material_id` IS NULL), 0) AS null_material_count,
  BIT_XOR(
    CRC32(
      CONCAT_WS(
        '#',
        `id`,
        `request_id`,
        `material_id`,
        `material_code_snapshot`,
        `material_name_snapshot`,
        `material_spec_snapshot`,
        `unit_code_snapshot`,
        `created_by`,
        `created_at`
      )
    )
  ) AS procurement_line_checksum
FROM `rd_procurement_request_line`;

SELECT COUNT(*) AS orphan_material_reference_count
FROM `rd_procurement_request_line` AS `line`
LEFT JOIN `material` ON `material`.`id` = `line`.`material_id`
WHERE `line`.`material_id` IS NOT NULL
  AND `material`.`id` IS NULL;

SELECT
  (
    SELECT COUNT(*)
    FROM `rd_material_status_history` AS `history`
    INNER JOIN `rd_procurement_request_line` AS `line`
      ON `line`.`id` = `history`.`request_line_id`
  ) AS status_history_count,
  (
    SELECT COUNT(*)
    FROM `rd_handoff_order_line` AS `handoff_line`
    INNER JOIN `rd_procurement_request_line` AS `line`
      ON `line`.`id` = `handoff_line`.`source_document_line_id`
    WHERE `handoff_line`.`source_document_type` = 'RdProcurementRequest'
  ) AS handoff_fact_count,
  (
    SELECT COUNT(*)
    FROM `workshop_material_order_line` AS `scrap_line`
    INNER JOIN `rd_procurement_request_line` AS `line`
      ON `line`.`id` = `scrap_line`.`source_document_line_id`
    WHERE `scrap_line`.`source_document_type` = 'RdProcurementRequest'
  ) AS workshop_material_fact_count,
  (
    SELECT COUNT(*)
    FROM `stock_in_order_line`
    WHERE `rd_procurement_request_line_id` IS NOT NULL
  ) AS legacy_stock_in_link_count;

DROP PROCEDURE IF EXISTS `migrate_20260712_rd_procurement_free_text_binding`;
DELIMITER //
CREATE PROCEDURE `migrate_20260712_rd_procurement_free_text_binding`()
BEGIN
  DECLARE `null_material_count` BIGINT DEFAULT 0;
  DECLARE `orphan_material_count` BIGINT DEFAULT 0;

  SELECT COUNT(*) INTO `null_material_count`
  FROM `rd_procurement_request_line`
  WHERE `material_id` IS NULL;

  SELECT COUNT(*) INTO `orphan_material_count`
  FROM `rd_procurement_request_line` AS `line`
  LEFT JOIN `material` ON `material`.`id` = `line`.`material_id`
  WHERE `line`.`material_id` IS NOT NULL
    AND `material`.`id` IS NULL;

  IF `null_material_count` > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Preflight failed: existing RD procurement lines contain NULL material_id';
  END IF;

  IF `orphan_material_count` > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Preflight failed: existing RD procurement lines contain orphan material references';
  END IF;

  ALTER TABLE `rd_procurement_request_line`
    MODIFY COLUMN `material_id` INT NULL,
    MODIFY COLUMN `material_code_snapshot` VARCHAR(64) NULL,
    ADD COLUMN `material_binding_source` ENUM(
      'BOM_CATALOG',
      'ACCEPTANCE_CONFIRMED',
      'LEGACY'
    ) NULL AFTER `unit_code_snapshot`,
    ADD COLUMN `material_bound_at` DATETIME(3) NULL AFTER `material_binding_source`,
    ADD COLUMN `material_bound_by` VARCHAR(64) NULL AFTER `material_bound_at`,
    ADD INDEX `rd_procurement_request_line_material_binding_source_idx` (`material_binding_source`);

  UPDATE `rd_procurement_request_line`
  SET
    `material_binding_source` = 'LEGACY',
    `material_bound_at` = `created_at`,
    `material_bound_by` = `created_by`
  WHERE `material_id` IS NOT NULL;
END//
DELIMITER ;

CALL `migrate_20260712_rd_procurement_free_text_binding`();
DROP PROCEDURE `migrate_20260712_rd_procurement_free_text_binding`;

-- Post-migration checks: all result counts must be zero except the expected
-- legacy-bound count, which must equal the preflight procurement line count.
SELECT
  COUNT(*) AS procurement_line_count,
  COALESCE(SUM(`material_id` IS NULL), 0) AS free_text_unbound_count,
  COALESCE(SUM(
    `material_id` IS NOT NULL
    AND `material_binding_source` = 'LEGACY'
  ), 0) AS legacy_bound_count,
  COALESCE(SUM(
    `material_id` IS NOT NULL
    AND `material_binding_source` IS NULL
  ), 0) AS bound_without_source_count,
  COALESCE(SUM(
    `material_id` IS NULL
    AND (
      `material_binding_source` IS NOT NULL
      OR `material_bound_at` IS NOT NULL
      OR `material_bound_by` IS NOT NULL
    )
  ), 0) AS unbound_with_audit_count,
  BIT_XOR(
    CRC32(
      CONCAT_WS(
        '#',
        `id`,
        `request_id`,
        `material_id`,
        `material_code_snapshot`,
        `material_name_snapshot`,
        `material_spec_snapshot`,
        `unit_code_snapshot`,
        `created_by`,
        `created_at`
      )
    )
  ) AS procurement_line_checksum
FROM `rd_procurement_request_line`;

SELECT COUNT(*) AS nullable_line_with_inventory_fact_count
FROM `rd_procurement_request_line` AS `line`
WHERE `line`.`material_id` IS NULL
  AND (
    EXISTS (
      SELECT 1
      FROM `rd_handoff_order_line` AS `handoff_line`
      WHERE `handoff_line`.`source_document_type` = 'RdProcurementRequest'
        AND `handoff_line`.`source_document_line_id` = `line`.`id`
    )
    OR EXISTS (
      SELECT 1
      FROM `workshop_material_order_line` AS `scrap_line`
      WHERE `scrap_line`.`source_document_type` = 'RdProcurementRequest'
        AND `scrap_line`.`source_document_line_id` = `line`.`id`
    )
    OR EXISTS (
      SELECT 1
      FROM `stock_in_order_line`
      WHERE `stock_in_order_line`.`rd_procurement_request_line_id` = `line`.`id`
    )
    OR EXISTS (
      SELECT 1
      FROM `inventory_log`
      WHERE `inventory_log`.`business_document_type` = 'RdProcurementRequest'
        AND `inventory_log`.`business_document_line_id` = `line`.`id`
    )
  );

SELECT
  (
    SELECT COUNT(*)
    FROM `rd_material_status_history` AS `history`
    INNER JOIN `rd_procurement_request_line` AS `line`
      ON `line`.`id` = `history`.`request_line_id`
  ) AS status_history_count,
  (
    SELECT COUNT(*)
    FROM `rd_handoff_order_line` AS `handoff_line`
    INNER JOIN `rd_procurement_request_line` AS `line`
      ON `line`.`id` = `handoff_line`.`source_document_line_id`
    WHERE `handoff_line`.`source_document_type` = 'RdProcurementRequest'
  ) AS handoff_fact_count,
  (
    SELECT COUNT(*)
    FROM `workshop_material_order_line` AS `scrap_line`
    INNER JOIN `rd_procurement_request_line` AS `line`
      ON `line`.`id` = `scrap_line`.`source_document_line_id`
    WHERE `scrap_line`.`source_document_type` = 'RdProcurementRequest'
  ) AS workshop_material_fact_count,
  (
    SELECT COUNT(*)
    FROM `stock_in_order_line`
    WHERE `rd_procurement_request_line_id` IS NOT NULL
  ) AS legacy_stock_in_link_count;
