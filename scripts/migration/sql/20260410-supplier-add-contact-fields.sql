SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'supplier'
      AND COLUMN_NAME = 'supplierShortName'
  ),
  'SELECT 1',
  'ALTER TABLE supplier ADD COLUMN supplierShortName VARCHAR(128) NULL AFTER supplierName'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'supplier'
      AND COLUMN_NAME = 'contactPerson'
  ),
  'SELECT 1',
  'ALTER TABLE supplier ADD COLUMN contactPerson VARCHAR(128) NULL AFTER supplierShortName'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'supplier'
      AND COLUMN_NAME = 'contactPhone'
  ),
  'SELECT 1',
  'ALTER TABLE supplier ADD COLUMN contactPhone VARCHAR(32) NULL AFTER contactPerson'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'supplier'
      AND COLUMN_NAME = 'address'
  ),
  'SELECT 1',
  'ALTER TABLE supplier ADD COLUMN address VARCHAR(255) NULL AFTER contactPhone'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
