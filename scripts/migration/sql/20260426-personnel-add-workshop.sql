ALTER TABLE `personnel`
  ADD COLUMN `workshop_id` INT NULL AFTER `contact_phone`,
  ADD INDEX `personnel_workshop_id_idx` (`workshop_id`),
  ADD CONSTRAINT `personnel_workshop_id_fkey`
    FOREIGN KEY (`workshop_id`) REFERENCES `workshop` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
