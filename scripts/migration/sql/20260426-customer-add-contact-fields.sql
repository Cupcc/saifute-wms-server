SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'customer'
      AND COLUMN_NAME = 'contactPerson'
  ),
  'SELECT 1',
  'ALTER TABLE customer ADD COLUMN contactPerson VARCHAR(128) NULL AFTER customerName'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'customer'
      AND COLUMN_NAME = 'contactPhone'
  ),
  'SELECT 1',
  'ALTER TABLE customer ADD COLUMN contactPhone VARCHAR(32) NULL AFTER contactPerson'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'customer'
      AND COLUMN_NAME = 'address'
  ),
  'SELECT 1',
  'ALTER TABLE customer ADD COLUMN address VARCHAR(255) NULL AFTER contactPhone'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
